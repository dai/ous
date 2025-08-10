"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  Github,
  GitBranch,
  Star,
  GitPullRequest,
  GitCommit,
  MessageSquare,
  GitFork,
  Tag,
  Globe2,
  FilePlus,
  RefreshCcw,
  Shield,
  Activity,
  MousePointerClick,
  Keyboard,
  ScrollText,
  RouteIcon,
  Eye,
  Clipboard,
  TriangleAlert,
} from "lucide-react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { z } from "zod"

type NormalizedGithubEvent = {
  id: string
  type: string
  actionText: string
  url?: string
  repo?: { name: string; url?: string }
  actor: { login: string; avatar_url?: string; url?: string }
  created_at: string
  icon: string
  details?: string[]
}

type GithubFeedResponse = {
  events: NormalizedGithubEvent[]
  rate?: { limit?: number; remaining?: number; reset?: number }
  source: "github"
}

type MyActivityEvent = {
  id: string
  type: "click" | "keydown" | "scroll" | "route-change" | "visibility" | "heartbeat" | "copy"
  label: string
  created_at: string // ISO
  meta?: Record<string, any>
  icon: string
}

type UnifiedItem = (NormalizedGithubEvent & { source: "github" }) | (MyActivityEvent & { source: "local" })

const DEFAULT_USERNAME = "vercel"

const githubSchema = z.object({
  username: z.string().trim().min(1),
  includeReceived: z.boolean().default(true),
  perPage: z.number().min(1).max(100).default(30),
})

function timeAgo(iso: string) {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diff = Math.max(0, now - then)
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return `${sec}秒前`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}分前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}時間前`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}日前`
  return new Date(iso).toLocaleString()
}

function iconFor(type: string) {
  switch (type) {
    case "PushEvent":
      return <GitCommit className="h-4 w-4" />
    case "PullRequestEvent":
      return <GitPullRequest className="h-4 w-4" />
    case "IssuesEvent":
      return <GitBranch className="h-4 w-4" />
    case "IssueCommentEvent":
      return <MessageSquare className="h-4 w-4" />
    case "WatchEvent":
      return <Star className="h-4 w-4" />
    case "ForkEvent":
      return <GitFork className="h-4 w-4" />
    case "CreateEvent":
      return <FilePlus className="h-4 w-4" />
    case "ReleaseEvent":
      return <Tag className="h-4 w-4" />
    case "PublicEvent":
      return <Globe2 className="h-4 w-4" />
    default:
      return <Github className="h-4 w-4" />
  }
}

function localIcon(type: MyActivityEvent["type"]) {
  switch (type) {
    case "click":
      return <MousePointerClick className="h-4 w-4" />
    case "keydown":
      return <Keyboard className="h-4 w-4" />
    case "scroll":
      return <ScrollText className="h-4 w-4" />
    case "route-change":
      return <RouteIcon className="h-4 w-4" />
    case "visibility":
      return <Eye className="h-4 w-4" />
    case "heartbeat":
      return <Activity className="h-4 w-4" />
    case "copy":
      return <Clipboard className="h-4 w-4" />
    default:
      return <Activity className="h-4 w-4" />
  }
}

export default function Page() {
  const [username, setUsername] = useState(DEFAULT_USERNAME)
  const [token, setToken] = useState("")
  const [includeReceived, setIncludeReceived] = useState(true)
  const [perPage, setPerPage] = useState(30)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [gh, setGh] = useState<GithubFeedResponse | null>(null)

  // My Activity
  const [tracking, setTracking] = useState(false)
  const [myEvents, setMyEvents] = useState<MyActivityEvent[]>([])
  const heartbeatRef = useRef<number | null>(null)
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const trackingKey = "my-activity-log-v1"

  // Load existing
  useEffect(() => {
    try {
      const raw = localStorage.getItem(trackingKey)
      if (raw) {
        const parsed: MyActivityEvent[] = JSON.parse(raw)
        setMyEvents(parsed)
      }
    } catch {}
  }, [])

  // Persist
  useEffect(() => {
    try {
      localStorage.setItem(trackingKey, JSON.stringify(myEvents))
    } catch {}
  }, [myEvents])

  // Event handlers for tracking
  useEffect(() => {
    if (!tracking) {
      if (heartbeatRef.current) {
        window.clearInterval(heartbeatRef.current)
        heartbeatRef.current = null
      }
      return
    }

    const add = (e: MyActivityEvent) => setMyEvents((prev) => [e, ...prev].slice(0, 2000)) // cap to 2k

    const onClick = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null
      const label = target?.getAttribute("aria-label") || target?.innerText?.slice(0, 64) || target?.tagName || "click"
      add({
        id: crypto.randomUUID(),
        type: "click",
        label,
        created_at: new Date().toISOString(),
        meta: {
          x: ev.clientX,
          y: ev.clientY,
          tag: target?.tagName,
          path: window.location.pathname + window.location.search,
        },
        icon: "click",
      })
    }

    const onKey = (ev: KeyboardEvent) => {
      add({
        id: crypto.randomUUID(),
        type: "keydown",
        label: `key:${ev.key}`,
        created_at: new Date().toISOString(),
        meta: { key: ev.key, path: window.location.pathname + window.location.search },
        icon: "keydown",
      })
    }

    let maxScroll = 0
    const onScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0
      const docHeight = document.documentElement.scrollHeight - window.innerHeight
      const depth = docHeight > 0 ? Math.round((scrollTop / docHeight) * 100) : 0
      if (depth > maxScroll) {
        maxScroll = depth
        add({
          id: crypto.randomUUID(),
          type: "scroll",
          label: `スクロール ${depth}%`,
          created_at: new Date().toISOString(),
          meta: { depth, path: window.location.pathname + window.location.search },
          icon: "scroll",
        })
      }
    }

    const onVis = () => {
      add({
        id: crypto.randomUUID(),
        type: "visibility",
        label: `visibility:${document.visibilityState}`,
        created_at: new Date().toISOString(),
        meta: { state: document.visibilityState },
        icon: "visibility",
      })
    }

    const onCopy = () => {
      add({
        id: crypto.randomUUID(),
        type: "copy",
        label: "コピー",
        created_at: new Date().toISOString(),
        icon: "copy",
      })
    }

    // heartbeats every 30s
    heartbeatRef.current = window.setInterval(() => {
      add({
        id: crypto.randomUUID(),
        type: "heartbeat",
        label: "滞在",
        created_at: new Date().toISOString(),
        meta: { path: window.location.pathname + window.location.search },
        icon: "heartbeat",
      })
    }, 30_000)

    window.addEventListener("click", onClick)
    window.addEventListener("keydown", onKey)
    window.addEventListener("scroll", onScroll, { passive: true })
    document.addEventListener("visibilitychange", onVis)
    document.addEventListener("copy", onCopy)

    return () => {
      window.removeEventListener("click", onClick)
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("scroll", onScroll)
      document.removeEventListener("visibilitychange", onVis)
      document.removeEventListener("copy", onCopy)
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current)
        heartbeatRef.current = null
      }
    }
  }, [tracking])

  // Track route changes
  const prevRouteRef = useRef<string>("")
  useEffect(() => {
    const full = pathname + (searchParams?.toString() ? `?${searchParams}` : "")
    if (prevRouteRef.current && tracking) {
      setMyEvents((prev) => [
        {
          id: crypto.randomUUID(),
          type: "route-change",
          label: `${prevRouteRef.current} → ${full}`,
          created_at: new Date().toISOString(),
          meta: { from: prevRouteRef.current, to: full },
          icon: "route-change",
        },
        ...prev,
      ])
    }
    prevRouteRef.current = full
  }, [pathname, searchParams, tracking])

  const fetchGithub = async () => {
    setError(null)
    setLoading(true)
    try {
      const parsed = githubSchema.safeParse({ username, includeReceived, perPage })
      if (!parsed.success) {
        setError("入力内容を確認してください")
        setLoading(false)
        return
      }
      const res = await fetch(
        `/api/github-feed?username=${encodeURIComponent(username)}&includeReceived=${includeReceived ? "1" : "0"}&per_page=${perPage}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: "no-store",
        },
      )
      if (!res.ok) {
        const txt = await res.text()
        throw new Error(txt || `GitHub API エラー: ${res.status}`)
      }
      const data: GithubFeedResponse = await res.json()
      setGh(data)
    } catch (e: any) {
      setError(e.message || "取得に失敗しました")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // initial load
    fetchGithub()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const unified: UnifiedItem[] = useMemo(() => {
    const ghItems: UnifiedItem[] = gh?.events.map((e) => ({ ...e, source: "github" as const })) ?? []
    const localItems: UnifiedItem[] = myEvents.map((e) => ({ ...e, source: "local" as const }))
    return [...ghItems, ...localItems].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
  }, [gh, myEvents])

  const clearLocal = () => {
    setMyEvents([])
    try {
      localStorage.removeItem(trackingKey)
    } catch {}
  }

  const exportLocal = () => {
    const blob = new Blob([JSON.stringify(myEvents, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `my-activity-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const onImport = (file?: File | null) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as MyActivityEvent[]
        setMyEvents(parsed)
      } catch {
        alert("JSON の解析に失敗しました")
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="border-b bg-background">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center gap-3">
          <Github className="h-6 w-6" />
          <h1 className="text-xl font-semibold">GitHub フィード #43; 自分のアクティビティ</h1>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="secondary" className="hidden sm:inline-flex">
              プライベートトークンは送信先のこのアプリにのみ届きます
            </Badge>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle>設定</CardTitle>
            <CardDescription>
              ユーザー名を指定して GitHub のイベントを取得。ローカル端末での行動はオプトインで保存されます。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <div className="grid gap-2">
                  <Label htmlFor="username">GitHub ユーザー名</Label>
                  <div className="flex gap-2">
                    <Input
                      id="username"
                      placeholder="octocat"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                    />
                    <Button onClick={fetchGithub} disabled={loading}>
                      <RefreshCcw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
                      更新
                    </Button>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="token">個人アクセストークン（任意）</Label>
                  <Input
                    id="token"
                    type="password"
                    placeholder="ghp_..."
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    送信先はこのアプリの API
                    のみ。ネットワークパネルで見える可能性があるため、共有環境では入力しないでください。
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <Label className="block">受信イベントも含める</Label>
                      <p className="text-xs text-muted-foreground">
                        フォロー中の人や関係するリポジトリの受信タイムライン
                      </p>
                    </div>
                    <Switch checked={includeReceived} onCheckedChange={setIncludeReceived} />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <Label htmlFor="perPage" className="block">
                        件数
                      </Label>
                      <p className="text-xs text-muted-foreground">1〜100（API パラメータ）</p>
                    </div>
                    <Input
                      id="perPage"
                      className="w-20 text-right"
                      type="number"
                      value={perPage}
                      onChange={(e) => setPerPage(Number(e.target.value))}
                      min={1}
                      max={100}
                    />
                  </div>
                </div>
                {gh?.rate && (
                  <div className="text-xs text-muted-foreground">
                    レート制限: {gh.rate.remaining ?? "-"} / {gh.rate.limit ?? "-"} 残り
                    {gh.rate.reset ? `（${new Date(gh.rate.reset * 1000).toLocaleTimeString()} にリセット）` : ""}
                  </div>
                )}
                {error && (
                  <div className="flex items-center gap-2 text-sm text-red-600">
                    <TriangleAlert className="h-4 w-4" />
                    <span>{error}</span>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label className="block">自分のアクティビティのトラッキング</Label>
                    <p className="text-xs text-muted-foreground">
                      クリック、キー入力、スクロール、ページ遷移、可視状態、滞在心拍、コピーをローカル保存
                    </p>
                  </div>
                  <Switch checked={tracking} onCheckedChange={setTracking} />
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={exportLocal}>
                    エクスポート
                  </Button>
                  <Label className="cursor-pointer inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    インポート
                    <input
                      type="file"
                      accept="application/json"
                      className="hidden"
                      onChange={(e) => onImport(e.target.files?.[0])}
                    />
                  </Label>
                  <Button variant="outline" onClick={clearLocal}>
                    ローカル履歴をクリア
                  </Button>
                </div>
                <Separator />
                <div className="text-xs text-muted-foreground">
                  サーバー側の詳細なトレースは OpenTelemetry のカスタムスパン追加で計測できます。[^1]
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6">
          <Tabs defaultValue="unified">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="unified">統合フィード</TabsTrigger>
              <TabsTrigger value="github">GitHub</TabsTrigger>
              <TabsTrigger value="local">自分のアクティビティ</TabsTrigger>
            </TabsList>
            <TabsContent value="unified" className="mt-4">
              <FeedList
                items={unified}
                emptyText="まだデータがありません。ユーザー名を設定して取得、またはトラッキングを開始してください。"
              />
            </TabsContent>
            <TabsContent value="github" className="mt-4">
              <GithubList events={gh?.events ?? []} loading={loading} />
            </TabsContent>
            <TabsContent value="local" className="mt-4">
              <LocalList events={myEvents} />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  )
}

function Avatar({ src, alt }: { src?: string; alt: string }) {
  return (
    <img
      src={src || "/placeholder.svg?height=40&width=40&query=default user avatar placeholder"}
      alt={alt}
      width={40}
      height={40}
      className="h-10 w-10 rounded-full border object-cover"
    />
  )
}

function FeedList({
  items,
  emptyText,
}: {
  items: UnifiedItem[]
  emptyText?: string
}) {
  if (!items.length) {
    return <p className="text-sm text-muted-foreground">{emptyText || "アイテムがありません"}</p>
  }
  return (
    <div className="space-y-3">
      {items.map((item) =>
        item.source === "github" ? (
          <Card key={`gh-${item.id}`}>
            <CardContent className="p-4 flex gap-3">
              <Avatar src={item.actor.avatar_url} alt={`${item.actor.login} avatar`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="shrink-0">
                    GitHub
                  </Badge>
                  <span className="text-sm text-muted-foreground">{timeAgo(item.created_at)}</span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-sm">
                  <span className="text-primary">{iconFor(item.type)}</span>
                  <span className="font-medium">{item.actionText}</span>
                </div>
                <div className="mt-1 text-sm">
                  {item.repo?.name && (
                    <Link href={item.repo.url || "#"} target="_blank" className="underline underline-offset-4">
                      {item.repo.name}
                    </Link>
                  )}
                </div>
                {item.details?.length ? (
                  <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">
                    {item.details.slice(0, 5).map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card key={`local-${item.id}`}>
            <CardContent className="p-4 flex gap-3">
              <div className="h-10 w-10 rounded-full border grid place-items-center">{localIcon(item.type)}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="shrink-0">
                    Local
                  </Badge>
                  <span className="text-sm text-muted-foreground">{timeAgo(item.created_at)}</span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-sm">
                  <span className="font-medium">{item.label}</span>
                </div>
                {item.meta && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {Object.entries(item.meta)
                      .slice(0, 5)
                      .map(([k, v]) => `${k}:${typeof v === "object" ? JSON.stringify(v) : v}`)
                      .join("  ")}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ),
      )}
    </div>
  )
}

function GithubList({ events, loading }: { events: NormalizedGithubEvent[]; loading: boolean }) {
  return (
    <div className="space-y-3">
      {loading && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">読み込み中...</CardContent>
        </Card>
      )}
      {!loading && events.length === 0 && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">GitHub イベントがありません</CardContent>
        </Card>
      )}
      {events.map((e) => (
        <Card key={e.id}>
          <CardContent className="p-4 flex gap-3">
            <Avatar src={e.actor.avatar_url} alt={`${e.actor.login} avatar`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{timeAgo(e.created_at)}</span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-sm">
                {iconFor(e.type)}
                <span className="font-medium">{e.actionText}</span>
              </div>
              <div className="mt-1 text-sm">
                {e.repo?.name && (
                  <Link href={e.repo.url || "#"} className="underline underline-offset-4" target="_blank">
                    {e.repo.name}
                  </Link>
                )}
              </div>
              {e.details?.length ? (
                <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">
                  {e.details.slice(0, 5).map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function LocalList({ events }: { events: MyActivityEvent[] }) {
  return (
    <div className="space-y-3">
      {events.length === 0 && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            まだローカルアクティビティはありません。トグルをオンにして計測を開始してください。
          </CardContent>
        </Card>
      )}
      {events.map((e) => (
        <Card key={e.id}>
          <CardContent className="p-4 flex gap-3">
            <div className="h-10 w-10 rounded-full border grid place-items-center">{localIcon(e.type)}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{timeAgo(e.created_at)}</span>
              </div>
              <div className="mt-1 text-sm font-medium">{e.label}</div>
              {e.meta && (
                <div className="mt-1 text-xs text-muted-foreground">
                  {Object.entries(e.meta)
                    .slice(0, 5)
                    .map(([k, v]) => `${k}:${typeof v === "object" ? JSON.stringify(v) : v}`)
                    .join("  ")}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
