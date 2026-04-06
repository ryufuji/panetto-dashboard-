export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-32 rounded bg-gray-200" />
          <div className="mt-2 h-4 w-20 rounded bg-gray-100" />
        </div>
        <div className="h-9 w-32 rounded bg-gray-100" />
      </div>
      <div className="rounded-lg border">
        <div className="border-b p-4">
          <div className="flex gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-6 w-16 rounded-full bg-gray-100" />
            ))}
          </div>
        </div>
        <div className="divide-y">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-12 bg-gray-50" />
          ))}
        </div>
      </div>
    </div>
  )
}
