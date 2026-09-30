import {
	Body,
	Container,
	Head,
	Heading,
	Html,
	Img,
	Link,
	Preview,
	Section,
	Tailwind,
	Text,
} from "@react-email/components";
import { EMAIL_BRAND_NAME, emailLogoUrl } from "./brand";
import Footer from "./components/Footer";

export function DownloadLink({ email = "" }: { email: string }) {
	return (
		<Html>
			<Head />
			<Preview>{`Download ${EMAIL_BRAND_NAME}`}</Preview>
			<Tailwind>
				<Body className="mx-auto my-auto bg-gray-1 font-sans">
					<Container className="mx-auto my-10 max-w-[500px] rounded border border-solid border-gray-200 px-10 py-5">
						<Section className="mt-8">
							<Img
								src={emailLogoUrl()}
								width="40"
								height="40"
								alt={EMAIL_BRAND_NAME}
								className="mx-auto my-0"
							/>
						</Section>
						<Heading className="mx-0 my-7 p-0 text-center text-xl font-semibold text-black">
							Your {EMAIL_BRAND_NAME} download links are here
						</Heading>
						<Text className="text-sm leading-6 text-black">
							Thanks for your interest in {EMAIL_BRAND_NAME}! Here are the
							download links for every platform:
						</Text>

						<Section className="my-6">
							<table cellPadding="0" cellSpacing="0" style={{ width: "100%" }}>
								<tr>
									<td style={{ paddingBottom: "12px" }}>
										<Link
											className="block w-full rounded-lg bg-black px-6 py-3 text-center text-[13px] font-semibold text-white no-underline"
											href="https://cap.so/download/apple-silicon"
										>
											Download for Mac (Apple Silicon)
										</Link>
									</td>
								</tr>
								<tr>
									<td style={{ paddingBottom: "12px" }}>
										<Link
											className="block w-full rounded-lg border border-solid border-gray-300 bg-white px-6 py-3 text-center text-[13px] font-semibold text-black no-underline"
											href="https://cap.so/download/apple-intel"
										>
											Download for Mac (Intel)
										</Link>
									</td>
								</tr>
								<tr>
									<td>
										<Link
											className="block w-full rounded-lg border border-solid border-gray-300 bg-white px-6 py-3 text-center text-[13px] font-semibold text-black no-underline"
											href="https://cap.so/download/windows"
										>
											Download for Windows
										</Link>
									</td>
								</tr>
							</table>
						</Section>

						<Text className="text-sm leading-6 text-black mt-4">
							{EMAIL_BRAND_NAME} lets you record your screen and camera and
							share it with a link.
						</Text>
						<Footer email={email} marketing={true} />
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
}
