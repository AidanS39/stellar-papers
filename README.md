<div align="center">

# Stellar Papers

_Explore academic papers through interactive, stellar graph visualizations._

[![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=next.js&logoColor=white)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](#)
[![MongoDB](https://img.shields.io/badge/MongoDB-008800?style=for-the-badge&logo=mongodb&logoColor=white)](#)
[![Neo4j](https://img.shields.io/badge/Neo4j-018BFF?style=for-the-badge&logo=neo4j&logoColor=white)](#)
[![Gemini](https://img.shields.io/badge/Gemini-8E75B2?style=for-the-badge&logo=google-gemini&logoColor=white)](#)
[![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)](#)

</div>

## Overview

Most academic databases provide flat lists of search results, making it difficult to understand the cross-disciplinary relationships and foundational literature within a field. Stellar Papers reimagines the literature review process by turning a database of 200,000+ research papers into an interactive, physics-simulated citation graph. Its focus on highly optimized data pipelines and fast rendering provides an immersive and openly experimental environment for discovering the connections that drive academic progress.

## Key Features

- **Interactive Citation Graph:** A high-performance graph visualizes complex relationships between academic papers based on who cited whom, allowing researchers to organically discover what research topics are related to what. Both light and dark themes are supported.
- **Deep Search & Filtering:** Filter the 200,000+ research papers dynamically by name, publication year, number of citations, author, and field using an intuitive UI.
- **Bookmark & Read Later:** Seamlessly save important papers to your personal dashboard and quickly open reports directly from the bookmarks menu. Bot-protected authentication is supported to make this feature possible and safe.
- **AI-Powered Insights & Summarization:** Leverage Google's Generative AI directly within the application to provide insights on graph results on the fly.

## Example Usage

Sign up for an account to unlock all features, or jump right into the public exploration graph.

Inside the app:

1. Use the **Search Bar** to type a research topic (e.g., "biology" or "neural network") and hit enter to spawn the graph.
2. Use the **Sidebar Sliders** to instantly filter out papers under certain conditions to narrow your focus.
3. Click any paper **Node** in the graph to open its details panel, open the link to the full paper, save the paper to your Bookmarks, and read about its connected nodes.
4. Click the Save Paper icon on a paper node to save it to your personal **Bookmarks** (requires login). Navigate to your **Bookmarks Panel** to review saved papers.
5. Trigger an AI summary of your current graph to gather valuable insights on high or low-density areas, find knowledge gaps or untapped areas, discover the most influential papers, and show cross-disciplinary connections.

## System Architecture

Stellar Papers employs a deeply optimized full-stack architecture to ensure complex graph queries and physics simulations feel instantaneous.

![GoalGetter Architecture](./docs/architecture.png)

1. **Client:** Built on the `Next.js App Router`, along with highly interactive React components, along with `Tailwind CSS` for rapid-iteration styling. The core visualization relies on `react-force-graph-2d` and `D3` to render the nodes and physics required to bring the graph to life.
2. **Backend/API:** Hosted on `Vercel`, and uses `Next.js API Routes` to handle secure, requests from the frontend to the database layers. To manage authentication state, `NextAuth.js` is used.
3. **Data:** `Neo4j` serves as the primary graph database, holding 200k+ papers, heavily pre-processed via `Python`, handling ultra-fast network relationship traversals using raw Cypher queries. Additional user and application state data (such as auth and bookmarks) are securely managed through `MongoDB`.
4. **External Services:** Our `OAuth 2.0 Providers` allows secure, frictionless social login through Google and GitHub. The bot protection service, `reCAPTCHA v3`, defends the sign-up and sign-in systems via invisible background challenges. The `OpenAlex API` allows us to populate our Neo4j instance with meaningful academic paper data. `Google Gemini` provides dynamic graph and paper analysis.

## Trade-offs & Design Decisions

- **Raw Cypher over Graph ORMs:** While ORMs provide type safety and rapid prototyping, they often generate sub-optimal queries for complex graph traversals. **Trade-off:** We wrote raw Cypher queries using the Neo4J driver. While this required manual type casting, it allowed us to aggressively optimize query execution plans, significantly reducing API latency and network packet size during the commonly dense graph retrievals. 
- **In-Memory LRU Caching vs Redis:** To cache identical high-volume searches, we utilized a server-side LRU cache directly within the Next.js API route instead of an external Redis instance. **Trade-off:** This sacrifices horizontal cache sharing across instances, but avoids the network I/O overhead of talking to Redis. For a read-heavy, data-intensive graph payload, the instant in-memory cache hits provided superior performance metrics.

## Performance & Benchmarks

Stellar Papers is engineered for high-performance scale, maintaining ultra-low-latency data retrieval and fluid rendering even when analyzing thousands of networked research texts.

*   **Average API Latency:** Achieved sub-50ms average response times to search the 200k+ node database, calculating citation edges in real-time capable of returning thousands of relevant nodes.
*   **Throughput Under Load:** Sustained 200+ heavy requests per second under load (validated via autocannon load testing), an 8x improvement over our original query strategy by leveraging LRU caching, indexing, and optimized queries.
*   **Rendering Optimization:** Engineered a high-performance interface capable of rendering thousands of nodes, ensuring a limitless exploratory experience.

## Tech Stack

| Category              | Technologies                                                                        |
| --------------------- | ----------------------------------------------------------------------------------- |
| **Frontend**          | Next.js App Router, TypeScript, Tailwind CSS, react-force-graph-2d, D3              |
| **Backend/API**       | Next.js API Routes, TypeScript, Auth.js                                             |
| **Data**              | MongoDB, Neo4j, Python                                                              |
| **External Services** | Google Gemini, Google reCAPTCHA, OpenAlex API, OAuth 2.0 Providers (Google, GitHub) |
| **Deployment**        | Vercel CI/CD                                                                        |

## Images

#### Variety of Topics:

![Variety of Topics](./public/Image%201%20-%20Variety%20of%20Topics.png)

#### Inspecting Papers:

![Inspecting Papers](./public/Image%202%20-%20Inspecting%20Papers.png)

#### Filtering and Bookmarks:

![Filtering and Bookmarks](./public/Image%203%20-%20Filtering%20and%20Bookmarks.png)

#### AI Analysis:

![Variety of Topics](./public/Image%204%20-%20AI%20Analysis.png)

## Local Installation & Setup

1. Clone the repository with `git clone https://github.com/AidanS39/stellar-papers.git`, enter the directory with `cd stellar-papers`, and install dependencies with `pnpm install`

2. Ensure you have instances of **Neo4j** and **MongoDB** running locally or via a cloud provider. 

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
