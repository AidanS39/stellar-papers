import { auth } from "../../../lib/authOptions";
import { redirect } from "next/navigation";
import SignUpForm from "./SignUpForm";

export default async function SignUp() {
    const session = await auth();

    if (session?.user?.id) {
        redirect("/");
    }

    return <SignUpForm />;
}
