import { auth } from "../../../lib/authOptions";
import { redirect } from "next/navigation";
import SignInForm from "./SignInForm";

export default async function SignIn() {
    const session = await auth();

    if (session?.user?.id) {
        redirect("/");
    }

    return <SignInForm />;
}
