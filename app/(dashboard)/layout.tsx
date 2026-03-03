import Sidebar from '@/components/layout/Sidebar'

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="flex h-screen overflow-hidden bg-background">
            <Sidebar />
            <main className="flex flex-1 flex-col overflow-y-auto p-8">
                {children}
            </main>
        </div>
    )
}
