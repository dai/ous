import { NextResponse } from "next/server"
import { trace } from "@opentelemetry/api" // Add custom spans for observability [^1]

const ghBase = "https://api.github.com"

async function fetchWithSpan<T>(name: string, fn: () => Promise<T>) {
  // Wrap work in a custom OpenTelemetry span for better tracing [^1]
  return await trace.getTracer("github-feed").startActiveSpan(name, async (span) => {
    try {
      const result = await fn()
      return result
    } finally {
      span.end()
    }
  })
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const username = searchParams.get("username")
  const includeReceived = searchParams.get("includeReceived") === "1"
  const perPage = Number(searchParams.get("per_page") || "30")
  const bearer = req.headers.get("authorization") || ""

  if (!username) {
    return NextResponse.json({ error: "username is required" }, { status: 400 })
  }

  const headers: Record<string, string> = {
    "User-Agent": "v0-github-activity-feed",
    Accept: "application/vnd.github+json",
  }
  if (bearer.toLowerCase().startsWith("bearer ")) {
    headers.Authorization = bearer
  }

  const userEventsUrl = `${ghBase}/users/${encodeURIComponent(username)}/events/public?per_page=${perPage}`
  const receivedUrl = `${ghBase}/users/${encodeURIComponent(username)}/received_events?per_page=${perPage}`

  try {
    const [userRes, receivedRes] = await fetchWithSpan("fetchGithubEvents", async () =>
      Promise.all([
        fetch(userEventsUrl, { headers, cache: "no-store" }),
        includeReceived ? fetch(receivedUrl, { headers, cache: "no-store" }) : Promise.resolve(null),
      ]),
    )

    const rate = {
      limit:
        (userRes.headers.get("x-ratelimit-limit") && Number(userRes.headers.get("x-ratelimit-limit"))) || undefined,
      remaining:
        (userRes.headers.get("x-ratelimit-remaining") && Number(userRes.headers.get("x-ratelimit-remaining"))) ||
        undefined,
      reset:
        (userRes.headers.get("x-ratelimit-reset") && Number(userRes.headers.get("x-ratelimit-reset"))) || undefined,
    }

    if (!userRes.ok) {
      const text = await userRes.text()
      return NextResponse.json({ error: text || "GitHub error" }, { status: userRes.status })
    }

    const userEvents = (await userRes.json()) as any[]
    const receivedEvents =
      receivedRes && "ok" in receivedRes && receivedRes?.ok ? ((await receivedRes.json()) as any[]) : []

    // Merge #43; dedupe by id
    const merged = [...userEvents, ...receivedEvents].filter(Boolean).reduce((acc: Record<string, any>, e: any) => {
      acc[e.id] = e
      return acc
    }, {})

    const normalized = Object.values(merged)
      .map(normalizeEvent)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    return NextResponse.json({ events: normalized, rate, source: "github" })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
}

function normalizeEvent(e: any) {
  const type = e.type as string
  const actor = {
    login: e.actor?.login || "",
    avatar_url: e.actor?.avatar_url,
    url:
      e.actor?.url?.replace("api.github.com/users", "github.com") ||
      (e.actor?.login ? `https://github.com/${e.actor.login}` : undefined),
  }
  const repo = e.repo
    ? {
        name: e.repo.name,
        url: `https://github.com/${e.repo.name}`,
      }
    : undefined

  const created_at = e.created_at

  switch (type) {
    case "PushEvent": {
      const commits = e.payload?.commits || []
      const details = commits.map((c: any) => `commit: ${c.message}`)
      const branch = e.payload?.ref?.replace("refs/heads/", "")
      return {
        id: e.id,
        type,
        actionText: `${actor.login} が ${branch} に ${commits.length} 件プッシュ`,
        url: repo?.url,
        repo,
        actor,
        created_at,
        icon: "git-commit",
        details,
      }
    }
    case "PullRequestEvent": {
      const action = e.payload?.action
      const pr = e.payload?.pull_request
      return {
        id: e.id,
        type,
        actionText: `${actor.login} が PR を ${action}: #${pr?.number} ${pr?.title || ""}`,
        url: pr?.html_url,
        repo,
        actor,
        created_at,
        icon: "git-pull-request",
      }
    }
    case "IssuesEvent": {
      const action = e.payload?.action
      const issue = e.payload?.issue
      return {
        id: e.id,
        type,
        actionText: `${actor.login} が Issue を ${action}: #${issue?.number} ${issue?.title || ""}`,
        url: issue?.html_url,
        repo,
        actor,
        created_at,
        icon: "git-branch",
      }
    }
    case "IssueCommentEvent": {
      const action = e.payload?.action
      const issue = e.payload?.issue
      return {
        id: e.id,
        type,
        actionText: `${actor.login} が Issue にコメント (${action})`,
        url: issue?.html_url,
        repo,
        actor,
        created_at,
        icon: "message-square",
      }
    }
    case "WatchEvent": {
      return {
        id: e.id,
        type,
        actionText: `${actor.login} が Star を付けました`,
        url: repo?.url,
        repo,
        actor,
        created_at,
        icon: "star",
      }
    }
    case "ForkEvent": {
      const forkee = e.payload?.forkee
      return {
        id: e.id,
        type,
        actionText: `${actor.login} がフォークしました`,
        url: forkee?.html_url || repo?.url,
        repo,
        actor,
        created_at,
        icon: "git-fork",
      }
    }
    case "CreateEvent": {
      const refType = e.payload?.ref_type
      const ref = e.payload?.ref
      return {
        id: e.id,
        type,
        actionText: `${actor.login} が ${refType}${ref ? `: ${ref}` : ""} を作成`,
        url: repo?.url,
        repo,
        actor,
        created_at,
        icon: "file-plus",
      }
    }
    case "ReleaseEvent": {
      const rel = e.payload?.release
      return {
        id: e.id,
        type,
        actionText: `${actor.login} がリリースを公開: ${rel?.tag_name || ""}`,
        url: rel?.html_url || repo?.url,
        repo,
        actor,
        created_at,
        icon: "tag",
      }
    }
    case "PublicEvent": {
      return {
        id: e.id,
        type,
        actionText: `${actor.login} がリポジトリを公開しました`,
        url: repo?.url,
        repo,
        actor,
        created_at,
        icon: "globe",
      }
    }
    default: {
      return {
        id: e.id,
        type,
        actionText: `${actor.login} が ${type} を実行`,
        url: repo?.url,
        repo,
        actor,
        created_at,
        icon: "github",
      }
    }
  }
}
