import Sidebar from '@/components/layout/Sidebar'

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="flex h-screen overflow-hidden bg-background">
            <Sidebar />
            <main className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden p-6 pb-24 md:pb-6">
                {children}
            </main>
        </div>
    )
}
