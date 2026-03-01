import { MongoClient, Db } from "mongodb";

const uri = process.env.MONGODB_URI as string;

if (!uri) {
    throw new Error("Please define MONGODB_URI in your environment variables");
}

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

declare global {
    var _mongoClientPromise: Promise<MongoClient> | undefined;
}

if (process.env.NODE_ENV === "development") {
    if (!global._mongoClientPromise) {
        client = new MongoClient(uri);
        global._mongoClientPromise = client.connect();
    }
    clientPromise = global._mongoClientPromise;
} else {
    client = new MongoClient(uri);
    clientPromise = client.connect();
}

export async function getDb(dbName?: string): Promise<Db> {
    const client = await clientPromise;
    return client.db(dbName);
}

export default clientPromise;
