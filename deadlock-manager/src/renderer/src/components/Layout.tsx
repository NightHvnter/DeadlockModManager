import { Outlet } from "react-router";
import AppBar from "./Appbar";

export default function Layout(): React.JSX.Element {
    return (
        <div className="min-h-screen bg-background text-foreground">
            <AppBar />
            <main className="p-4">
                <Outlet />
            </main>
        </div>
    )
}