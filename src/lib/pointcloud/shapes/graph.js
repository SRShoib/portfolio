// The network graph: clustered nodes connected by edges, built entirely from maths (no model file),
// the same spirit as the leaf. The story (CLAUDE.md, hero spec): this is agentic AI — small groups of
// agents that talk to each other within a group, and groups that talk to each other across a wider
// network. That reads as: nodes that clump together, and edges both inside and between the clumps.

import { normalize, seededRandom } from './utils.js';

const CLUSTER_COUNT = 5;
const NODES_PER_CLUSTER = 3;
const CLUSTER_RADIUS = 1; // how far a cluster's centre sits from the whole graph's centre
const NODE_SPREAD = 0.22; // how far a node sits from its own cluster's centre
const NODE_RADIUS = 0.09; // radius of the small point-ball at each node
const EDGE_JITTER = 0.012; // matches leaf.js's stipple jitter, so edges don't look laser-plotted

// Share of the particle budget spent on nodes (denser blobs) vs. edges (thinner lines). More than
// half goes to nodes so they read as bright hubs against additive blending, not just thicker dots.
const SHARE = { nodes: 0.55, edges: 0.45 };

/**
 * A point uniformly distributed inside a solid ball (not just its surface) of `radius`, centred at
 * (cx, cy, cz). Two things make it uniform by VOLUME rather than by angle:
 *   - picking cos(polar) uniformly over its full [-1, 1] range (not just [0, 1], which would only
 *     cover a hemisphere — see tooth.js's crown, which deliberately uses the half range instead)
 *   - taking a CUBE root of the random radius fraction, because a sphere's volume grows with r^3, the
 *     same reasoning leaf.js and tooth.js use with a SQUARE root where area grows with r^2 (a disk, a
 *     cone). One more point per unit volume near the centre needs proportionally fewer points than one
 *     more point per unit volume near the surface, and cbrt(u) is what makes that come out even.
 */
function pointInBall(cx, cy, cz, radius, rand) {
  const cosPolar = 1 - 2 * rand();
  const polar = Math.acos(cosPolar);
  const azimuth = rand() * Math.PI * 2;
  const r = radius * Math.cbrt(rand());
  const sinPolar = Math.sin(polar);
  return [cx + r * sinPolar * Math.cos(azimuth), cy + r * sinPolar * Math.sin(azimuth), cz + r * Math.cos(polar)];
}

/** Scatter `count` points along the straight line from a to b, each with a small 3D jitter. */
function pointsOnEdge(a, b, count, rand, put) {
  for (let i = 0; i < count; i++) {
    // A straight line has constant "speed" along its length, unlike the leaf's curved outline, so a
    // plain uniform u needs no arc-length correction to land evenly.
    const u = rand();
    put(
      a[0] + (b[0] - a[0]) * u + (rand() - 0.5) * EDGE_JITTER,
      a[1] + (b[1] - a[1]) * u + (rand() - 0.5) * EDGE_JITTER,
      a[2] + (b[2] - a[2]) * u + (rand() - 0.5) * EDGE_JITTER,
    );
  }
}

/**
 * Generate the graph.
 * @param {number} count number of particles
 * @param {number} seed change it for a different (but equally reproducible) layout
 * @returns {Float32Array} count*3 positions, centred on the origin, longest side = 2
 */
export function makeGraph(count, seed = 5) {
  const rand = seededRandom(seed);
  const positions = new Float32Array(count * 3);
  let written = 0;
  const put = (x, y, z) => {
    positions[written++] = x;
    positions[written++] = y;
    positions[written++] = z;
  };

  // 1. Cluster centres, spaced evenly around a ring with a little jitter so they don't look
  //    mechanically regular. Flattened in y and given a little z spread for a gentle 3D arrangement.
  const clusters = [];
  for (let c = 0; c < CLUSTER_COUNT; c++) {
    const angle = (c / CLUSTER_COUNT) * Math.PI * 2 + (rand() - 0.5) * 0.35;
    const radius = CLUSTER_RADIUS * (0.85 + rand() * 0.3);
    clusters.push([Math.cos(angle) * radius, Math.sin(angle) * radius * 0.75, (rand() - 0.5) * 0.7]);
  }

  // 2. Nodes: a few per cluster, placed inside a small ball around that cluster's centre.
  const nodesByCluster = clusters.map(([cx, cy, cz]) =>
    Array.from({ length: NODES_PER_CLUSTER }, () => pointInBall(cx, cy, cz, NODE_SPREAD, rand)),
  );
  const allNodes = nodesByCluster.flat();

  // 3. Edges: every pair of nodes WITHIN a cluster (a small fully-connected clump), plus one edge
  //    from each cluster's first node to the next cluster's first node, so the whole graph reads as
  //    one connected network and not five separate islands.
  const edges = [];
  for (const clusterNodes of nodesByCluster) {
    for (let i = 0; i < clusterNodes.length; i++) {
      for (let j = i + 1; j < clusterNodes.length; j++) edges.push([clusterNodes[i], clusterNodes[j]]);
    }
  }
  for (let c = 0; c < CLUSTER_COUNT; c++) {
    edges.push([nodesByCluster[c][0], nodesByCluster[(c + 1) % CLUSTER_COUNT][0]]);
  }

  // 4. Spend the particle budget. Nodes get an equal share each; edges get a share proportional to
  //    their LENGTH, so a long inter-cluster edge and a short intra-cluster one end up equally DENSE
  //    (points per unit length), instead of an equal split per edge leaving the long ones looking faint.
  const nNodeTotal = Math.round(count * SHARE.nodes);
  const nEdgeTotal = count - nNodeTotal;

  const perNode = Math.floor(nNodeTotal / allNodes.length);
  let nodeBudgetUsed = 0;
  for (const [nx, ny, nz] of allNodes) {
    for (let i = 0; i < perNode; i++) {
      put(...pointInBall(nx, ny, nz, NODE_RADIUS, rand));
      nodeBudgetUsed++;
    }
  }
  // perNode * allNodes.length almost never lands exactly on nNodeTotal; spend the remainder one point
  // at a time, cycling through the nodes, so no single node is favoured by the rounding.
  for (let i = 0; nodeBudgetUsed < nNodeTotal; i++, nodeBudgetUsed++) {
    put(...pointInBall(...allNodes[i % allNodes.length], NODE_RADIUS, rand));
  }

  const lengths = edges.map(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  const totalLength = lengths.reduce((sum, length) => sum + length, 0);
  let edgeBudgetUsed = 0;
  edges.forEach(([a, b], i) => {
    // The last edge absorbs whatever rounding left over, so the total is always exactly nEdgeTotal.
    const isLast = i === edges.length - 1;
    const share = isLast ? nEdgeTotal - edgeBudgetUsed : Math.round((lengths[i] / totalLength) * nEdgeTotal);
    pointsOnEdge(a, b, share, rand, put);
    edgeBudgetUsed += share;
  });

  return normalize(positions);
}
