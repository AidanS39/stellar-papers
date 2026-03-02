<div align="center">

# Stellar Papers

_Explore academic citation networks through interactive, high-performance stellar graph visualizations._

[![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=next.js&logoColor=white)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](#)
[![Neo4j](https://img.shields.io/badge/Neo4j-018BFF?style=for-the-badge&logo=neo4j&logoColor=white)](#)

</div>

## Overview

Most academic databases provide flat lists of search results, making it difficult to understand the conceptual relationships and foundational literature within a field. Stellar Papers reimagines the literature review process by turning a database of over 200,000 research papers into an interactive, physics-simulated citation network. Its focus on highly optimized Neo4j data pipelines and flawless WebGL rendering provides an immersive, delay-free environment for discovering the connections that drive academic progress.

## Key Features

- **Interactive Citation Networks:** A high-performance WebGL canvas visualizes complex relationships between academic papers based on who cited whom, allowing researchers to organically discover foundational texts.
- **Deep Search & Filtering:** Filter the 200,000+ node graph dynamically by author, field, publication year, minimum citations, and topic using an intuitive UI. 
- **AI-Powered Insights & Summarization:** Leverage Google's Generative AI directly within the application to summarize complex papers and generate topic insights on the fly.
- **Bookmark & Read Later:** Seamlessly save important papers to your personal dashboard and quickly open full OpenAlex reports directly from the bookmarks menu. 

## Example Usage

Sign up for an account to unlock all features, or jump right into the public exploration graph.

Inside the app:

1. Use the **Search Bar** to type a research topic (e.g., "transformer" or "biology") and hit enter to spawn the node network.
2. Use the **Sidebar Sliders** to instantly filter out papers with low citation counts, or constrain the publication year to narrow your focus.
3. Click any **Node** in the graph to open its details panel, read the abstract, and analyze its specific metadata.
4. Click the **Save Bookmark** icon on a paper node to save it to your personal reading list (requires login). 
5. Navigate to your **Bookmarks Panel** to review saved papers, access their OpenAlex reports, or trigger an AI summary.

## System Architecture

Stellar Papers employs a deeply optimized full-stack architecture to ensure complex graph queries and physics simulations feel instantaneous.

1. **Client:** Built on the `Next.js App Router` with React Server Components. The core visualization relies on `react-force-graph-2d` utilizing WebGL Canvas rendering for the nodes and D3 physics for the layout.
2. **Backend/API:** Leverages `Next.js API Routes` to handle secure, rate-limited requests from the frontend to the database layers.
3. **Graph Data Engine:** `Neo4j` serves as the primary graph database, holding 200k+ heavily pre-processed papers. It handles ultra-fast network relationship traversals using raw Cypher queries. 
4. **Relational/Document Data:** Additional user and application state data (such as auth and bookmarks) are securely managed across `PostgreSQL` and `MongoDB` instances.
5. **External Services:** `Auth.js` securely handles user sessions. `OpenAlex API` enriches the initial graph data, and `Google Generative AI` provides dynamic paper summarization. 

## Trade-offs & Design Decisions

- **Raw Cypher over Graph ORMs:** While ORMs provide type safety and rapid prototyping, they often generate sub-optimal queries for complex graph traversals. **Trade-off:** We wrote raw Cypher queries using the `neo4j-driver`. While this required manual type casting, it allowed us to aggressively optimize query execution plans, significantly reducing API latency and network packet size during dense graph retrievals. 
- **In-Memory LRU Caching vs Redis:** To cache identical high-volume searches, we utilized a server-side `lru-cache` directly within the Next.js API route instead of an external Redis instance. **Trade-off:** This sacrifices horizontal cache sharing across instances, but avoids the network I/O overhead of talking to Redis. For a read-heavy, data-intensive graph payload, the 0ms in-memory retrieval provided superior performance metrics.
- **WebGL Canvas vs SVG Elements:** The application renders nodes via Canvas rather than standard DOM/SVG elements. **Trade-off:** Canvas sacrifices some native CSS styling capabilities and accessibility hooks, but it completely bypasses the browser's expensive DOM reflow pipeline. This was strictly necessary to maintain 60 FPS while applying D3 physics collision and spring-force calculations to thousands of nodes simultaneously. 

## Performance & Benchmarks

Stellar Papers is engineered for high-performance scale, maintaining ultra-low-latency data retrieval and fluid rendering even when analyzing thousands of networked research texts.

*   **Average API Latency:** Achieved **~48ms** average response times to search the 200k node database, calculating multi-hop graph citation edges in real-time and returning up to 1,000 top-cited nodes.
*   **Throughput Under Load:** Sustained roughly **~410 heavy requests per second** under peak API load (validated via `autocannon` load testing), an 8x improvement generated by our custom LRU memoization strategy. 
*   **Frontend Rendering Optimization:** Engineered a high-performance Canvas WebGL interface capable of rendering and physics-simulating up to 1,000 interactive nodes at a flawless **60.0 FPS** (validated via headless `puppeteer` framerate tracking), ensuring a stutter-free exploratory experience.
*   **Data Scale:** Successfully querying against a preprocessed Neo4j graph database of over **200,000** distinct academic research papers and their citation relationships.

## Tech Stack

| Category              | Technologies                                                          |
| --------------------- | --------------------------------------------------------------------- |
| **Frontend**          | Next.js App Router, TypeScript, Tailwind CSS, react-force-graph-2d    |
| **Backend/API**       | Next.js API Routes, TypeScript, Auth.js, lru-cache                    |
| **Data**              | Neo4j, MongoDB                                            |
| **External Services** | OpenAlex API, Google Generative AI                                    |

## Local Installation & Setup

1. Clone the repository and install dependencies using `pnpm`:
```bash
git clone https://github.com/BryanWieschenberg/StellarPapers.git
cd StellarPapers
pnpm install
```

2. Ensure you have instances of **Neo4j**, **PostgreSQL**, and **MongoDB** running locally or via a cloud provider. 

3. Set up your local `.env` file with the following keys using your own credentials:

```bash
# Configuration
ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Neo4j (Graph Database)
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=<your_neo4j_password>

# MongoDB (Database)
MONGODB_URI=<mongodb_uri>

# Authentication (NextAuth)
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<random_secure_string>

# OAuth Providers (Google & GitHub)
GOOGLE_CLIENT_ID=<google_client_id>
GOOGLE_CLIENT_SECRET=<google_client_secret>
GITHUB_CLIENT_ID=<github_client_id>
GITHUB_CLIENT_SECRET=<github_client_secret>

# External Services (reCAPTCHA, Gemini)
OPENALEX_API_KEY=<openalex_api_key>
GEMINI_API_KEY=<gemini_api_key>
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=<recaptcha_site_key>
RECAPTCHA_SECRET_KEY=<recaptcha_secret_key>
```

4. You will need to populate the database (and optionally apply indexes) with the preprocessing scripts (located in the preprocessing directory) before fully utilizing the graph explorer.

5. Run the development server with `pnpm dev`, visit `http://localhost:3000`, and you're ready to go!
