export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 rounded bg-gray-200" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 rounded-lg border bg-gray-100" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-64 rounded-lg border bg-gray-100" />
        <div className="h-64 rounded-lg border bg-gray-100" />
      </div>
      <div className="h-48 rounded-lg border bg-gray-100" />
    </div>
  )
}
