db.createCollection("users", {
    validator: {
        $jsonSchema: {
            bsonType: "object",
            required: ["username", "email", "provider"],
            properties: {
                username: {
                    bsonType: "string",
                    description: "must be a string and is required",
                },
                email: {
                    bsonType: "string",
                    pattern: "^.+@.+$",
                    description: "must be a valid email address and is required",
                },
                password: {
                    bsonType: "string",
                    description: "hashed password, required for credentials provider",
                },
                provider: {
                    enum: ["credentials", "google", "github"],
                    description: "must be credentials, google, or github",
                },
                provider_id: {
                    bsonType: "string",
                    description: "OAuth subject/id",
                },
                email_verified: {
                    bsonType: "bool",
                },
                settings: {
                    bsonType: "object",
                    description: "Optional user preferences",
                },
                createdAt: {
                    bsonType: "date",
                },
            },
        },
    },
});

db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ username: 1 }, { unique: true });

db.createCollection("saved_papers", {
    validator: {
        $jsonSchema: {
            bsonType: "object",
            required: ["userId", "paperId", "title", "savedAt"],
            properties: {
                userId: {
                    bsonType: "objectId",
                    description: "Reference to the users collection",
                },
                paperId: {
                    bsonType: "string",
                    description: "OpenAlex ID (e.g., 'W123456789')",
                },
                title: {
                    bsonType: "string",
                },
                savedAt: {
                    bsonType: "date",
                },
            },
        },
    },
});

db.saved_papers.createIndex({ userId: 1, paperId: 1 }, { unique: true });
