export default function ScanLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 overflow-y-auto bg-background">
      {children}
    </div>
  );
}
