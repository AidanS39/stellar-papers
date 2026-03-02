import { MongoClient, Db, MongoClientOptions } from "mongodb";

const uri = process.env.MONGODB_URI as string;

if (!uri) {
    throw new Error("Please define MONGODB_URI in your environment variables");
}

const options: MongoClientOptions = {
    tls: true,
    tlsAllowInvalidCertificates: true,
};

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

declare global {
    var _mongoClientPromise: Promise<MongoClient> | undefined;
}

if (process.env.NODE_ENV === "development") {
    if (!global._mongoClientPromise) {
        client = new MongoClient(uri, options);
        global._mongoClientPromise = client.connect();
    }
    clientPromise = global._mongoClientPromise;
} else {
    client = new MongoClient(uri, options);
    clientPromise = client.connect();
}

export async function getDb(dbName?: string): Promise<Db> {
    const client = await clientPromise;
    return client.db(dbName);
}

export default clientPromise;

export async function ensureIndexes(): Promise<void> {
    const db = await getDb();
    await db.collection("saved_papers").createIndex({ userId: 1, paperId: 1 }, { unique: true });
    await db.collection("saved_papers").createIndex({ userId: 1 });
    await db.collection("saved_papers").createIndex({ savedAt: -1 });
}
