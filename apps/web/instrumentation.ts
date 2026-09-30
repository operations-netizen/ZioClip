import { OTLPHttpJsonTraceExporter, registerOTel } from "@vercel/otel";

export async function register() {
	// Server-only: an ingest token must never use a NEXT_PUBLIC_* name, which
	// Next inlines into any client bundle that references it.
	if (process.env.NEXT_PUBLIC_AXIOM_TOKEN) {
		console.warn(
			"[instrumentation] NEXT_PUBLIC_AXIOM_TOKEN is ignored; set AXIOM_TOKEN instead and remove the public variable.",
		);
	}

	if (process.env.AXIOM_TOKEN) {
		registerOTel({
			serviceName: "cap-web-backend",
			traceExporter: new OTLPHttpJsonTraceExporter({
				url: "https://api.axiom.co/v1/traces",
				headers: {
					Authorization: `Bearer ${process.env.AXIOM_TOKEN}`,
					"X-Axiom-Dataset": process.env.AXIOM_DATASET ?? "",
				},
			}),
		});
	} else if (process.env.NODE_ENV === "development") {
		registerOTel({
			serviceName: "cap-web-backend",
			traceExporter: new OTLPHttpJsonTraceExporter({}),
		});
	}

	if (process.env.NEXT_RUNTIME === "nodejs") {
		const { register } = await import("./instrumentation.node");
		await register();
	}
}
