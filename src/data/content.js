// Single data module mirroring CONTENT.md. If they ever disagree, CONTENT.md wins: edit it
// first, then sync this file. Nothing here is invented: every string comes from CONTENT.md.
//
// TODOs: anything marked **TODO** in CONTENT.md is a `todo('…')` marker, never a made-up value.
// Rendering rule (CLAUDE.md rule 1): show a visible TODO placeholder in dev, render nothing in
// production, e.g. `import.meta.env.DEV && isTodo(x) ? placeholder(x) : null`.
//
// Lines marked "(draft)" in CONTENT.md were written from the CV and are used as-is.
//
// Deliberately absent (CONTENT.md §11, "Do NOT show"): phone number and street address.

const TODO = Symbol.for('portfolio.todo');

/** Marks a value that CONTENT.md says is still missing. `note` is what has to be provided. */
export const todo = (note) => ({ [TODO]: true, note });
export const isTodo = (value) => value != null && value[TODO] === true;

// ---- 1. Identity ---------------------------------------------------------------------
export const identity = {
  name: 'Md. Mehedi Hasan Shoib',
  wordmark: 'SHOIB',
  title: 'AI/ML Engineer · Generative & Agentic AI',
  tagline:
    'I build retrieval and multi-agent AI systems that ship, backed by research in medical and agricultural computer vision.', // (draft)
  badge: 'Research Assistant @ HIRL · Open to AI/ML roles',
  location: 'Dhaka, Bangladesh',
  availability: 'Open to full-time roles, on-site Dhaka or remote.',
  portrait: {
    // Used in: About, hero fallback (reduced motion / no WebGL), OG image, JSON-LD
    src: '/images/profile/portrait.png',
    width: 928,
    height: 1065,
    alt: 'Portrait of Md. Mehedi Hasan Shoib',
  },
  // Same photo, background removed. Used for the face shape of the hero point cloud.
  portraitCutout: '/images/profile/portrait-cutout.png',
};

// ---- 2. Hero captions (one per point-cloud shape) -----------------------------------------
export const heroCaptions = {
  face: null, // no caption: the name, title and badge introduce me
  tooth: 'Medical imaging — explainable, privacy-preserving diagnosis', // (draft)
  leaf: 'Agricultural vision — open datasets for crop disease detection', // (draft)
  graph: 'Agentic AI — RAG and multi-agent systems in production', // (draft)
};

// ---- 3. Statement (draft) ------------------------------------------------------------
export const statement = {
  text: 'I build Generative and Agentic AI systems — retrieval pipelines, multi-agent workflows and the evaluations that keep them honest — grounded in research on medical and agricultural computer vision.',
  accentWords: ['Generative', 'Agentic', 'evaluations', 'research'],
};

// ---- 4. Stats (animated counters) --------------------------------------------------------
export const stats = [
  { value: 5, suffix: '', label: 'publications' },
  { value: 3, suffix: '', label: 'live full-stack AI applications' },
  { value: 700, suffix: '+', label: 'competitive programming problems solved' },
  { value: 60, suffix: '+', label: 'programming contests (including onsite)' },
];

// ---- 5. Research / Engineering split ----------------------------------------------------------
export const split = {
  research: {
    title: 'Research',
    text: 'Medical and agricultural computer vision at the Health Informatics Research Lab — explainable AI, privacy-preserving split learning, fusion models, and open image datasets.',
    href: '#publications',
  },
  engineering: {
    title: 'Engineering',
    text: 'Production RAG and agentic systems — FastAPI backends, LangGraph pipelines, evaluation harnesses, deployed with Docker and CI/CD.',
    href: '#work',
  },
};

// Architecture stages (`architecture.flow` and `.supporting`). A stage is either a plain string (just
// a label) or an object:
//   { label, detail?, kind?: 'gate', conditional?: true, loopsBackTo?: '<label of an earlier stage>' }
// `stage()` turns either into an object, so the pages (and later the M5 diagram) handle one shape.
export const stage = (s) => (typeof s === 'string' ? { label: s } : s);

// ---- 6. Projects (order = order on the page and in previous/next navigation) -------------------
export const projects = [
  {
    slug: 'enterprise-knowledge-assistant',
    name: 'Enterprise Knowledge Assistant',
    oneLiner:
      'Enterprise RAG assistant for internal documents, with role-aware retrieval, cited answers and quality monitoring.',
    tags: ['RAG', 'Full-stack', 'Access control'],
    status: 'Live',
    links: {
      live: 'https://enterprise-knowledge-assistant-blond.vercel.app/',
      apiDocs: 'https://enterprise-knowledge-assistant-production-8283.up.railway.app/docs',
      github: 'https://github.com/SRShoib/Enterprise-Knowledge-Assistant',
    },
    cover: { path: '/images/projects/enterprise-knowledge-assistant/cover.png' },
    chips: ['4-role RBAC', 'Citation-aware answers', 'RAGAS-style evals'],
    problem:
      'Teams need to search internal documents quickly, but every answer must be traceable to its source, and users must only see content they are authorized to access.', // (draft)
    built: [
      'Document upload with automated ingestion',
      'Citation-aware chat workspace with confidence indicators',
      'Admin dashboard showing usage metrics and low-confidence queries',
      'JWT authentication with 4-role RBAC, chat history, feedback capture and audit logging',
    ],
    // Diagram source: `flow` is the main pipeline, left to right; `supporting` hangs off it.
    architecture: {
      flow: [
        'Upload (PDF / DOCX / TXT)',
        'Parsing',
        'Recursive chunking',
        'OpenAI embeddings',
        'Pinecone index',
        'Role-filtered retrieval',
        'LLM answer with citations + confidence',
        'Chat workspace',
      ],
      supporting: [
        'JWT auth + RBAC',
        'PostgreSQL (history, feedback, audit log)',
        'LangSmith tracing',
        'RAGAS-style evaluation endpoint',
      ],
    },
    decisions: [
      'Role filtering happens at retrieval time, so unauthorized content never reaches the model',
      'Confidence indicators, plus an admin view of low-confidence queries to find gaps',
      'Evaluation endpoint and LangSmith tracing to monitor answer quality over time',
    ],
    evaluation: {
      results: [],
      // CONTENT.md: "Until then, describe the evaluation setup only." Each line is a phrase that
      // already appears above (architecture.supporting / built); nothing is reworded or added.
      setup: [
        'RAGAS-style evaluation endpoint',
        'LangSmith tracing',
        'Admin dashboard showing usage metrics and low-confidence queries',
      ],
      todo: todo(
        'add any measured results (answer quality scores, retrieval metrics, latency). Until then, describe the evaluation setup only.',
      ),
    },
    stack: {
      backend: [
        'FastAPI',
        'Python',
        'LangChain',
        'OpenAI',
        'Pinecone',
        'PostgreSQL',
        'SQLAlchemy',
        'JWT',
        'LangSmith',
        'Docker Compose',
      ],
      frontend: ['Next.js 14', 'React', 'TypeScript', 'Tailwind CSS'],
    },
    deployment: 'API on Railway, frontend on Vercel, Docker Compose',
    // "What I'd do next": null = none, on purpose (CONTENT.md). A string or an array of strings would
    // make the case study render the section; null makes it leave the section out entirely.
    next: null,
  },

  {
    slug: 'filing-reconciler',
    name: 'Filing Reconciler',
    oneLiner:
      "Agentic analyst that cross-checks a company's 10-K, 10-Q, earnings-call transcript and press release for contradictions, then writes a cited risk memo.",
    tags: ['Agents', 'LangGraph', 'Human-in-the-loop'],
    status: 'Live',
    links: {
      live: 'https://multi-document-financial-contradict.vercel.app/',
      apiDocs: 'https://multidocumentfinancialcontradictionanalyst-production.up.railway.app/docs',
      github: 'https://github.com/SRShoib/multi-document_financial_contradiction_analyst',
    },
    cover: { path: '/images/projects/filing-reconciler/cover.png' },
    chips: ['1.00 numeric precision/recall on 3 sample sets', '2 human approval gates', 'CI-gated evals'],
    problem:
      "Contradictions between a company's filings, earnings call and press releases are a risk signal, but finding them means reading hundreds of pages side by side.", // (draft)
    built: [
      'Agentic LangGraph pipeline with Postgres checkpointing, two human-in-the-loop approval gates, and cost/iteration circuit breakers',
      'Reviewer UI: live pipeline stepper, drag-and-drop PDF upload with document tagging, confirm/reject/edit contradiction cards with click-to-expand citations',
      'CI-gated evaluation harness behind a provider-agnostic LLM interface',
    ],
    architecture: {
      // Ingest → Parallel claim extraction → Reconciliation → Risk scoring → [Gate 1, conditional] →
      // Draft memo ⇄ Critique → [Gate 2] → Finalize   (CONTENT.md)
      flow: [
        'Ingest',
        { label: 'Parallel claim extraction', detail: 'one branch per document' },
        'Reconciliation',
        'Risk scoring',
        {
          label: 'Gate 1: contradiction review',
          kind: 'gate',
          conditional: true,
          detail:
            'A run only stops here if a contradiction is high severity or has confidence below 0.75; otherwise it goes straight to the memo. The reviewer confirms, rejects or edits each contradiction.',
        },
        'Draft memo',
        {
          label: 'Critique',
          loopsBackTo: 'Draft memo', // Draft memo ⇄ Critique
          detail: 'Reflection loop, capped by iterations and cost',
        },
        {
          label: 'Gate 2: memo sign-off',
          kind: 'gate',
          detail: 'Every run passes through it. The reviewer approves the memo or requests changes.',
        },
        'Finalize',
      ],
      supporting: [
        {
          label: 'Postgres checkpointing',
          detail:
            "Each gate pauses once with all pending items, and the graph's checkpointer (Postgres for durable runs) lets a run pause and resume later",
        },
        'Circuit breakers (cost / iterations)',
      ],
    },
    decisions: [
      'Numeric contradiction detection is fully deterministic (regex + tolerance comparison); the LLM never generates figures',
      'Human approval gates before high-stakes steps',
      'Provider-agnostic LLM interface so models can be swapped without code changes',
    ],
    evaluation: {
      // WORDING RULE (CONTENT.md): wherever the 1.00 result appears (this line and the card chip) it
      // says it was measured on these three sample sets, so it is not read as a large-scale benchmark.
      results: [
        '1.00 precision and recall on numeric contradiction detection, measured on three labeled sample sets (6 gold contradictions plus a clean control)',
        'Exact-span citation match',
        'Eval harness tracks F0.5, citation faithfulness and expected calibration error (ECE)',
      ],
      evalSet: {
        intro: 'Three labeled sample sets, each with filings, a manifest and gold labels',
        sets: [
          {
            name: 'set_a',
            text: 'ACME FY2023 (10-K, 10-Q, earnings call, press release), 3 gold contradictions: revenue mismatch, FY2024 guidance revision, litigation narrative conflict',
          },
          { name: 'set_b', text: 'Globex Q2 FY2024, 3 gold contradictions of the same three types' },
          {
            name: 'set_c',
            text: 'Initech FY2025, a clean control with no contradictions, so any flag counts against precision',
          },
        ],
      },
      metrics: [
        'F0.5 (weighted toward precision)',
        'Numeric-mismatch accuracy',
        'Exact citation-span match',
        'LLM-judge faithfulness',
        'Memo citation coverage',
        'ECE (calibration error)',
      ],
      ciGate: {
        intro: 'A separate "Evaluation gate" step',
        checks: [
          'Precision = 1.0',
          'Recall >= 0.95',
          'Numeric accuracy = 1.0',
          'Exact-span match = 1.0',
          'ECE <= 0.35',
          'Zero predictions on the clean control set',
        ],
      },
      feedbackLoop:
        'Contradictions a reviewer confirms are copied back into the gold labels, so reviewer decisions become regression tests',
    },
    stack: {
      backend: ['FastAPI', 'Python', 'LangGraph', 'Pydantic v2', 'PostgreSQL', 'Docker', 'OpenAI API'],
      frontend: ['Next.js 16', 'React 19', 'TypeScript', 'Tailwind CSS', 'Framer Motion'],
    },
    deployment: 'API on Railway, frontend on Vercel',
    next: null,
  },

  {
    slug: 'supportlens',
    name: 'SupportLens',
    oneLiner:
      'End-to-end NLP platform that turns raw support tickets into structured intelligence: classification, entities, sentiment, topics, search and RAG-drafted replies.',
    tags: ['NLP', 'Fine-tuning', 'RAG'],
    status: 'Live',
    links: {
      live: 'https://supportlens-pink.vercel.app/',
      apiDocs: 'https://supportlens-api-7ulp.onrender.com/docs',
      github: 'https://github.com/SRShoib/Supportlens',
    },
    cover: { path: '/images/projects/supportlens/cover.png' },
    chips: ['+0.115 macro-F1', 'hit-rate@5 0.920', '< $0.04 LLM spend'],
    problem:
      'Support teams sit on thousands of unstructured tickets; finding what is urgent, what customers are asking about, and how to reply takes manual triage.', // (draft)
    built: [
      'Intent and urgency classification, entity extraction, sentiment trajectories, summarization, topic discovery, semantic search and RAG-drafted replies',
      'Next.js metrics dashboard backed by a PostgreSQL-persisted evaluation harness with live drift monitoring',
    ],
    architecture: {
      flow: [
        'Tickets',
        'Classification (intent, urgency)',
        'Entity extraction',
        'Sentiment',
        'Summarization',
        'Topic discovery (BERTopic)',
        'Hybrid retrieval (dense embeddings + cross-encoder rerank)',
        'Citation-grounded reply drafts',
        'Dashboard',
      ],
      supporting: ['PostgreSQL eval harness', 'Drift monitoring', 'Budget-capped LLM client'],
    },
    decisions: [
      'Benchmarked classical baselines against fine-tuned transformers for each task and deployed the winner. It was not a uniform transformer win: the baseline won intent classification (0.9990 vs. 0.9975 macro-F1) and rules won NER overall (0.585 vs. 0.447)',
      'Hybrid retrieval with cross-encoder reranking',
      'Budget-capped LLM client',
    ],
    evaluation: {
      results: [
        '+0.115 macro-F1 on urgency classification (0.794 → 0.910; TF-IDF + LinearSVC baseline → DeBERTa-v3-small)',
        '+0.17 ROUGE-1 on summarization (FLAN-T5)',
        'Retrieval hit-rate@5: 0.920',
        'Total LLM spend under $0.04',
      ],
      // Per task: the classical baseline vs. the model it was compared with, who won, and by how much.
      // WORDING RULE (CONTENT.md): never present this as transformers winning every task. The intent
      // baseline beat the transformer, and NER's overall winner is rules. `winner` and `margin` are the
      // strings shown on the page; `note` is optional.
      baselines: [
        {
          task: 'Intent',
          baseline: 'TF-IDF + LinearSVC',
          compared: 'DistilBERT',
          winner: 'Baseline wins',
          margin: '0.9990 vs. 0.9975 macro-F1',
        },
        {
          task: 'Urgency',
          baseline: 'TF-IDF + LinearSVC',
          compared: 'DeBERTa-v3-small',
          winner: 'Transformer wins',
          margin: '0.794 → 0.910',
        },
        {
          task: 'NER',
          baseline: 'Regex/rules',
          compared: 'BERT-base-cased',
          winner: 'Rules win overall',
          margin: '0.585 vs. 0.447',
          note: 'Each entity type goes to whichever does better',
        },
        {
          task: 'Sentiment/emotion',
          baseline: 'TF-IDF + LinearSVC',
          compared: 'DistilBERT',
          winner: 'Transformer wins',
          margin: '+0.064 / +0.106',
        },
        {
          task: 'Summarization',
          baseline: 'Lead-k extractive',
          compared: 'FLAN-T5-small',
          winner: 'Transformer wins',
          margin: '+0.16-0.17 ROUGE-1',
        },
        {
          task: 'Topics',
          baseline: 'TF-IDF/KMeans',
          compared: 'BERTopic',
          winner: 'BERTopic wins',
          margin: '0.226 vs. 0.143 NPMI',
        },
        {
          task: 'Search',
          baseline: 'Dense retrieval only',
          compared: '+ cross-encoder rerank',
          winner: 'Rerank wins',
          margin: '0.900 → 0.920 hit-rate@5',
        },
      ],
      // `name` is the text before the colon in CONTENT.md, `text` the text after it.
      datasets: [
        {
          name: 'Bitext Customer Support (Hugging Face)',
          text: '27 intents, about 27k utterances — used to train intent classification',
        },
        {
          name: 'Customer Support on Twitter (Kaggle, about 3M tweets)',
          text: 'unlabeled real-world text, used for cleaning, clustering, search and drift analysis',
        },
        { name: 'tweet_eval (sentiment/emotion)', text: 'transfer learning for sentiment and emotion models' },
        { name: 'samsum / dialogsum', text: 'transfer learning for thread summarization' },
        {
          name: 'Synthetic NER set (generated) plus a 200-example hand-checked gold set',
          text: 'entity extraction for ORDER_ID, PRODUCT, DATE, AMOUNT and ACCOUNT_REF',
        },
        {
          name: 'Urgency labels',
          text: 'no existing dataset has these; rule-based labels plus up to 2,000 LLM-generated labels',
        },
      ],
    },
    // Docker Compose and CI/CD come after the frontend items in CONTENT.md's original list but are
    // grouped under Backend; each group keeps its own original order.
    stack: {
      backend: [
        'FastAPI',
        'PostgreSQL',
        'Chroma',
        'Hugging Face Transformers',
        'BERTopic',
        'OpenAI',
        'Docker Compose',
        'CI/CD',
      ],
      frontend: ['Next.js 15', 'TypeScript', 'Tailwind CSS'],
    },
    deployment: 'API on Render, frontend on Vercel',
    next: null,
  },

  {
    slug: 'youtube-rag-chatbot',
    name: 'YouTube Transcript RAG Chatbot',
    oneLiner: 'Chrome extension that answers questions about any YouTube video using only its transcript.',
    tags: ['RAG', 'Chrome extension', 'Backend'],
    status: 'Deployed backend',
    links: {
      github: 'https://github.com/SRShoib/YouTube-ChatBot',
      apiDocs: 'https://youtube-chatbot-tzq1.onrender.com/docs',
      demo: todo('Chrome Web Store or demo video (optional)'),
    },
    cover: { path: '/images/projects/youtube-rag-chatbot/cover.png' },
    chips: ['Manifest V3', 'Rate-limited shared backend', 'Cold-start resilient'],
    problem:
      'Long videos are hard to search; viewers want answers from the video itself without scrubbing through it.', // (draft)
    built: [
      'Manifest V3 Chrome extension with DOM transcript extraction',
      'FastAPI backend with LangServe routes for Q&A and a dedicated summarization path',
    ],
    architecture: {
      flow: [
        'YouTube page',
        'Transcript extraction (extension)',
        'FastAPI backend',
        'Recursive chunking',
        'OpenAI embeddings',
        'FAISS search',
        'Answer / Summary (LangServe routes)',
        'Extension UI',
      ],
      supporting: ['Per-IP rate limiting', 'LRU-capped vector store', 'Automatic re-indexing'],
    },
    decisions: [
      'Per-IP rate limiting to protect a shared backend',
      'LRU-capped vector store to bound memory',
      'Automatic re-indexing so the service survives free-tier cold starts on Render',
    ],
    evaluation: {
      results: [],
      todo: todo('(optional) evaluation & results'),
    },
    stack: {
      backend: ['Python', 'FastAPI', 'LangChain', 'LangServe', 'FAISS', 'OpenAI API'],
      frontend: ['JavaScript', 'Chrome Extension (MV3)'],
    },
    deployment: 'Backend on Render',
    next: null,
  },
];

// ---- 7. Publications ---------------------------------------------------------------------
// `authors`: my name is flagged with me:true so it can be emphasised. A todo() means
// CONTENT.md has no author list for that paper yet.
const author = (name, me = false) => ({ name, me });

export const publications = [
  {
    title:
      'SplitX-OralNet: A Privacy-Preserving and Explainable Deep Learning Framework for Multi-class Oral Disease Detection from Intraoral Images',
    type: 'Conference paper',
    year: 2026,
    venue:
      'Proceedings of the 3rd International Conference on Big Data, IoT and Machine Learning (BIM 2025), Springer, Lecture Notes in Networks and Systems vol. 1800',
    doi: 'https://doi.org/10.1007/978-3-032-15764-5_22',
    tags: ['Medical imaging', 'Split learning', 'Explainable AI'],
    authors: [
      author('Md. Mehedi Hasan Shoib', true),
      author('Fayazunnesa Chowdhury'),
      author('Emon Shikder'),
      author('Sabbir Hossain Durjoy'),
      author('Md. Hasan Imam Bijoy'),
    ],
  },
  {
    title:
      'XAI-GIFNet: A Fusion of DenseNet121 and EfficientNetB0 with Gradient-Based Explainability for GI Bleeding Detection from Endoscopic Imagery',
    type: 'Conference paper',
    year: 2026,
    venue: 'BIM 2025, Springer LNNS vol. 1800',
    doi: 'https://doi.org/10.1007/978-3-032-15764-5_8',
    tags: ['Medical imaging', 'Fusion models', 'Explainable AI'],
    authors: [
      author('Sabbir Hossain Durjoy'),
      author('Fayazunnesa Chowdhury'),
      author('Md. Mehedi Hasan Shoib', true),
      author('Md. Emon Shikder'),
      author('Md. Hasan Imam Bijoy'),
    ],
  },
  {
    title:
      'CardioLiteNet: A Two-Stage Lightweight Autoencoder-Augmented Framework for Robust ECG Image Classification on Small Datasets',
    type: 'Conference paper',
    year: 2026,
    venue: 'BIM 2025, Springer LNNS vol. 1800',
    doi: 'https://doi.org/10.1007/978-3-032-15764-5_23',
    tags: ['Medical imaging', 'Autoencoders', 'Explainable AI (Grad-CAM, TCAV)'],
    authors: [
      author('Emon Shikder'),
      author('Fayazunnesa Chowdhury'),
      author('Md. Majidul Kabir'),
      author('Sabbir Hossain Durjoy'),
      author('Md. Mehedi Hasan Shoib', true),
      author('Md. Hasan Imam Bijoy'),
    ],
  },
  {
    title: 'Cauliflower Leaf Diseases: A Computer Vision Dataset for Smart Agriculture',
    type: 'Dataset article',
    year: 2025,
    venue: 'Data in Brief, vol. 60, article 111594 (Elsevier)',
    doi: 'https://doi.org/10.1016/j.dib.2025.111594',
    note: '2,661 field images of cauliflower leaves in three classes, collected in Bangladesh',
    // `samples`: the images shown on this card, under public/<dir>/. Each `file` is shown only if it
    // exists. A `label` (a class name) is shown under its thumbnail and named in its alt text; without
    // one the alt text is "Sample <subject> image N". `aspect` is the thumbnail shape (default: square)
    // and `columns` how many fit across from tablet width up (default 3; always 3 on a phone).
    // One photo per class (the dataset has three); the file name IS the class name. Order is the folder's
    // alphabetical order.
    // SIZES (`columns`, `aspect`) are tuned so this card and the IDBGL card come out the same height (see
    // the comment on IDBGL's samples). The photos are 3000x3000 squares and are shown whole (no crop), 2.5
    // columns wide: two per row, the third centred below. With IDBGL at three per row this keeps the two
    // cards within 40px of each other at every width from 768 to 1920px (Cauliflower at 3 columns and 3:4
    // left IDBGL 77-174px taller).
    samples: {
      dir: '/images/publications/cauliflower',
      subject: 'cauliflower leaf',
      columns: 2.5,
      aspect: '1 / 1',
      images: [
        { file: 'Black Rot.jpg', label: 'Black Rot' },
        { file: 'Healthy.jpg', label: 'Healthy' },
        { file: 'Insect Hole.jpg', label: 'Insect Hole' },
      ],
      credit: {
        label: 'Cauliflower Leaf Diseases dataset (Mendeley Data)',
        url: 'https://data.mendeley.com/datasets/x995snz7p3',
      },
    },
    tags: ['Agricultural vision', 'Open dataset'],
    authors: [
      author('Sabbir Hossain Durjoy'),
      author('Md Emon Shikder'),
      author('Md Mehedi Hasan Shoib', true),
      author('Md Hasan Imam Bijoy'),
    ],
  },
  {
    title:
      'IDBGL: A Unique Image Dataset of Black Gram (Vigna mungo) Leaves for Disease Detection and Classification',
    type: 'Dataset article',
    year: 2025,
    venue: 'Data in Brief (Elsevier)',
    doi: 'https://doi.org/10.1016/j.dib.2025.111347',
    // One photo per class (the dataset has five classes); the file name IS the class name, so the same
    // string is the label. The photos are 3000x4000 (3:4), and the leaves are tall (up to 9%-93% of the
    // height), so they are shown uncropped at 3:4: a square crop would cut into several leaves.
    // Order is the folder's alphabetical order.
    // SIZES: `columns` is how many thumbnails fit across the card from tablet width up (fewer = bigger
    // photos; on a phone it is always three). Three per row, then the last two centred below. This is the
    // size the site owner asked for, and it keeps every label comfortably readable. Because it makes this
    // card tall, Cauliflower's photos were enlarged to match (see its comment); measured over eight widths
    // (768-1920px) the two cards then differ by +7 to -40px, and any leftover is spread across the shorter
    // card's gaps.
    samples: {
      dir: '/images/publications/black-gram',
      subject: 'black gram leaf',
      columns: 3,
      aspect: '3 / 4',
      images: [
        { file: 'Cercospora leaf spot.jpg', label: 'Cercospora leaf spot' },
        { file: 'Healthy.jpg', label: 'Healthy' },
        { file: 'Insect.jpg', label: 'Insect' },
        { file: 'Leaf Crinkle.jpg', label: 'Leaf Crinkle' },
        { file: 'Yellow Mosaic.jpg', label: 'Yellow Mosaic' },
      ],
      credit: {
        label: 'IDBGL dataset (Mendeley Data)',
        url: 'https://data.mendeley.com/datasets/z55yrbmn2d',
      },
    },
    tags: ['Agricultural vision', 'Open dataset'],
    authors: [
      author('Md. Mehedi Hasan Shoib', true),
      author('Shahnewaz Saeem'),
      author('Afia Benta Aziz Tonima'),
      author('Mayen Uddin Mojumdar'),
    ],
  },
];

// Publication images (CONTENT.md §7). RESOLVED: both leaf datasets allow sample images with credit,
// so the two dataset articles carry `samples` (2-3 images each, plus a credit line linking to the
// dataset). Medical images from the three medical papers are NEVER shown, so those entries must not
// get a `samples` field. A missing image file is simply not shown (see the `picture` directive).

// ---- 8. Journey timeline ----------------------------------------------------------------
export const timeline = [
  { when: 'Jan 2022', text: 'Started B.Sc. in Computer Science & Engineering at Daffodil International University' },
  { when: 'Fall 2022', text: '18th place, DIU Take-Off Programming Contest (Final)' },
  { when: 'Fall 2023', text: '26th place, Unlock the Algorithm (Preliminary, Slot A)' },
  { when: 'Jan 2025', text: 'Joined the Health Informatics Research Lab (HIRL) as a Research Assistant' },
  { when: '2025', text: 'Published two open image datasets in Data in Brief (cauliflower and black gram leaves)' },
  { when: 'Jan 2026', text: 'Completed B.Sc. in CSE, CGPA 3.80 / 4.00' }, // graduation confirmed
  { when: 'Apr 2026', text: 'Three papers published in the BIM 2025 proceedings (Springer)' },
];
export const timelineProjectDates = todo('(optional) month/year for each project launch');

// ---- 9. About ----------------------------------------------------------------------------
export const about = {
  experience: {
    role: 'Research Assistant',
    org: 'Health Informatics Research Lab (HIRL), Daffodil International University',
    period: 'Jan 2025 – Present',
    mode: 'On-site',
    location: 'Savar, Dhaka',
    bullets: [
      'Research on medical imaging in healthcare and agricultural image data in agriculture',
      'Build custom ML and deep learning models for computer vision and write research papers',
      'Co-authored five publications: three conference papers and two dataset articles',
    ],
  },
  education: {
    degree: 'B.Sc. in Computer Science & Engineering',
    school: 'Daffodil International University',
    period: 'Jan 2022 – Jan 2026',
    status: 'Completed',
    cgpa: '3.80 / 4.00',
  },
  problemSolving: {
    summary: '700+ problems solved across judges · 60+ contests including onsite',
    highlight: 'Beecrowd: top 1%, 210+ solved',
    // Link only, no ratings shown.
    profiles: [
      { label: 'Beecrowd', url: 'https://judge.beecrowd.com/en/profile/645784' },
      { label: 'Codeforces', url: 'https://codeforces.com/profile/shoib15-5511' },
      { label: 'LeetCode', url: 'https://leetcode.com/u/srshoib/' },
      { label: 'VJudge', url: 'https://vjudge.net/user/SRShoib' },
    ],
  },
  competitions: [
    {
      result: '18th',
      name: 'DIU Take-Off Programming Contest Fall 2022, Final',
      url: 'https://toph.co/c/diu-take-off-fall-2022-final/standings',
    },
    {
      result: '26th',
      name: 'Unlock the Algorithm Fall 2023, Preliminary (Slot A)',
      url: 'https://toph.co/c/unlock-the-algorithm-fall-23-preliminary-a-slot/standings',
    },
    {
      result: '45th',
      name: 'DIU Take-Off Programming Contest Fall 2022, Slot B',
      url: 'https://toph.co/c/diu-take-off-fall-2022-slot-b/standings',
    },
    {
      result: '42nd',
      name: 'DIU Take-Off Programming Contest Fall 2022, Mock',
      url: 'https://toph.co/c/diu-take-off-fall-2022-mock/standings',
    },
    {
      result: 'Certificate',
      name: 'Take-Off Programming Contest Final, Fall 2022',
      url: 'https://drive.google.com/file/d/15eTkWevgZ4iHAgL4m5nLO3TvoPG-fP_y/view?usp=sharing',
    },
  ],
  skills: [
    {
      group: 'Generative & Agentic AI',
      items: [
        'LLMs',
        'fine-tuning (LoRA, QLoRA)',
        'RAG',
        'multi-agent orchestration',
        'LangChain',
        'LangGraph',
        'LangServe',
        'LangSmith',
        'n8n',
        'prompt engineering',
        'tool calling',
        'structured output',
        'human-in-the-loop',
        'embedding models',
        'semantic and hybrid search',
        'chunking strategies',
        'reranking',
        'metadata filtering',
      ],
    },
    {
      group: 'NLP',
      items: [
        'tokenization',
        'text classification',
        'NER',
        'sentiment analysis',
        'summarization',
        'topic modeling',
        'semantic similarity',
        'Hugging Face Transformers',
      ],
    },
    {
      group: 'ML & Deep Learning',
      items: [
        'computer vision',
        'MLOps',
        'PyTorch',
        'TensorFlow',
        'supervised and unsupervised learning',
        'ANN',
        'CNN',
        'LSTM',
        'Transformers',
        'graph neural networks',
        'attention',
        'fusion models',
        'explainable AI (Grad-CAM, Grad-CAM++, SHAP, LIME, TCAV)',
        'federated and split learning',
      ],
    },
    {
      group: 'Backend & APIs',
      items: [
        'FastAPI',
        'REST API design',
        'Pydantic',
        'authentication',
        'async request handling',
        'model-serving endpoints',
      ],
    },
    { group: 'Databases', items: ['PostgreSQL', 'MySQL', 'FAISS', 'Chroma', 'Pinecone'] },
    {
      group: 'Frontend',
      items: ['Next.js', 'React', 'TypeScript', 'Tailwind CSS', 'HTML/CSS', 'Streamlit'],
    },
    { group: 'DevOps', items: ['Docker', 'Git', 'GitHub Actions', 'CI/CD'] },
    { group: 'Languages', items: ['Python', 'C', 'C++', 'Java', 'JavaScript', 'SQL'] },
  ],
};

// ---- 10. Tech stack marquee -------------------------------------------------------------
export const marquee = {
  row1: [
    'LangGraph',
    'LangChain',
    'LangSmith',
    'LangServe',
    'OpenAI',
    'Hugging Face',
    'Pinecone',
    'Chroma',
    'FAISS',
    'LoRA / QLoRA',
    'BERTopic',
    'n8n',
  ],
  row2: [
    'PyTorch',
    'TensorFlow',
    'FastAPI',
    'Pydantic',
    'PostgreSQL',
    'Docker',
    'GitHub Actions',
    'Next.js',
    'TypeScript',
    'Python',
    'C++',
  ],
};

// ---- 11. Contact & links -------------------------------------------------------------------
export const contact = {
  tagline: "Let's build AI that ships.", // (draft)
  // Privacy rule 5: the address is never written out as one string. Keep it in two parts and
  // assemble it in JS at runtime with getEmail(); static HTML gets a readable fallback instead.
  email: { user: 'srshoibofficial', domain: 'gmail.com' },
  github: 'https://github.com/SRShoib',
  linkedin: 'https://www.linkedin.com/in/md-mehedi-hasan-shoib-1b7b35258',
  resume: '/resume.pdf',
  // Research profiles, in the order the footer shows them. `label` is the visible link text.
  // (Hugging Face / Kaggle were not provided: add them here only if the profiles have real content.)
  researchProfiles: [
    { label: 'Google Scholar', url: 'https://scholar.google.com/citations?user=iY736XgAAAAJ&hl=en' },
    { label: 'ResearchGate', url: 'https://www.researchgate.net/profile/Md-Mehedi-Hasan-Shoib' },
    { label: 'ORCID', url: 'https://orcid.org/0009-0007-4596-2325' },
  ],
};

export const getEmail = () => `${contact.email.user}@${contact.email.domain}`;

// ---- 12. SEO --------------------------------------------------------------------------------
export const seo = {
  homeTitle: 'Md. Mehedi Hasan Shoib — AI/ML Engineer (Generative & Agentic AI)',
  homeDescription:
    'AI/ML engineer building RAG and multi-agent LLM systems, with published research in medical and agricultural computer vision. Based in Dhaka, Bangladesh.',
  domain: todo('production domain'), // deferred until M8: canonical, og:*, JSON-LD and sitemap need it
  caseStudyTitle: (projectName) => `${projectName} — Case study | Md. Mehedi Hasan Shoib`,
};
