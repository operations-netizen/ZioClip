// This file is used to run database migrations in the docker builds or other self hosting environments.
// It is not suitable (a.k.a DEADLY) for serverless environments where the server will be restarted on each request.
//

import {
	BucketAlreadyOwnedByYou,
	CreateBucketCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { migrateDb } from "@cap/database/migrate";
import { buildEnv, serverEnv } from "@cap/env";
import {
	formatProductionConfigProblem,
	getProductionConfigProblems,
} from "@/lib/production-config";

export async function register() {
	if (process.env.NEXT_PUBLIC_IS_CAP) return;

	// Loud, name-only report of missing production settings and leftover
	// development settings. Logged rather than thrown so an intentionally
	// partial deployment still starts; see PRODUCTION_CHECKLIST.md.
	if (process.env.NODE_ENV === "production") {
		for (const problem of getProductionConfigProblems(process.env)) {
			console.error(`[config] ${formatProductionConfigProblem(problem)}`);
		}
	}

	console.log("Waiting 5 seconds to run migrations");
	// Function to trigger migrations with retry logic
	const triggerMigrations = async (retryCount = 0, maxRetries = 3) => {
		try {
			await runMigrations();
		} catch (error) {
			console.error(
				`🚨 Error triggering migrations (attempt ${retryCount + 1}):`,
				error,
			);
			if (retryCount < maxRetries - 1) {
				console.log(
					`🔄 Retrying in 5 seconds... (${retryCount + 1}/${maxRetries})`,
				);
				setTimeout(() => triggerMigrations(retryCount + 1, maxRetries), 5000);
			} else {
				console.error(`🚨 All ${maxRetries} migration attempts failed.`);
				process.exit(1); // Exit with error code if all attempts fail
			}
		}
	};
	// Add a timeout to trigger migrations after 5 seconds on server start
	setTimeout(() => triggerMigrations(), 5000);
	setTimeout(() => createS3Bucket(), 5000);
}

async function createS3Bucket() {
	const s3Client = new S3Client({
		endpoint: serverEnv().S3_INTERNAL_ENDPOINT,
		region: serverEnv().CAP_AWS_REGION,
		credentials: {
			accessKeyId: serverEnv().CAP_AWS_ACCESS_KEY ?? "",
			secretAccessKey: serverEnv().CAP_AWS_SECRET_KEY ?? "",
		},
		forcePathStyle: serverEnv().S3_PATH_STYLE,
	});

	// The bucket is created private. Every read in the app goes through a
	// presigned URL, so a public-read policy only let anyone who learned an
	// object key (owner and video IDs appear in share-page URLs) fetch private,
	// password-protected or deleted-from-view recordings directly.
	await s3Client
		.send(new CreateBucketCommand({ Bucket: serverEnv().CAP_AWS_BUCKET }))
		.then(() => {
			console.log("Created S3 bucket (private)");
		})
		.catch((e) => {
			if (e instanceof BucketAlreadyOwnedByYou) {
				console.log("Found existing S3 bucket");
				return;
			}
			console.error("🚨 Could not create the S3 bucket", e);
		});
}

async function runMigrations() {
	const isDockerBuild = buildEnv.NEXT_PUBLIC_DOCKER_BUILD === "true";
	if (isDockerBuild) {
		try {
			console.log("🔍 DB migrations triggered");
			console.log("💿 Running DB migrations...");

			await migrateDb();

			console.log("💿 Migrations run successfully!");
		} catch (error) {
			console.error("🚨 MIGRATION_FAILED", { error });
			throw error;
		}
	}
}
