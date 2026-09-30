import { getCurrentUser } from "@cap/database/auth/session";
import { SHOW_FULL_ONBOARDING } from "@/lib/branding";
import Bottom from "./components/Bottom";
import Stepper from "./components/Stepper";

export default async function OnboardingLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const user = await getCurrentUser();
	const completedSteps = user?.onboardingSteps || {};

	return (
		<div className="flex relative flex-col justify-center items-center px-5 py-10 w-full custom-scroll min-h-fit lg:min-h-auto h-dvh bg-gray-1">
			{SHOW_FULL_ONBOARDING && <Stepper completedSteps={completedSteps} />}
			{children}
			{SHOW_FULL_ONBOARDING && <Bottom />}
		</div>
	);
}
