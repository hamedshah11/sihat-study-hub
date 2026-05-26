export function Placeholder({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-primary">{title}</h1>
      <div className="mt-6 rounded-xl bg-surface p-6 text-sm text-muted-foreground">{body}</div>
    </div>
  );
}
