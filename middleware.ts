import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { checkStrIsNotionId, getLastPartOfUrl } from '@/lib/utils'
import { idToUuid } from 'notion-utils'
import BLOG from './blog.config'

/**
 * Clerk 身份验证中间件
 */
export const config = {
  // 这里设置白名单，防止静态资源被拦截
  matcher: [
    '/((?!.*\\..*|_next|/sign-in|/auth).*)',
    '/',
    '/(api|trpc)(.*)',
    // WordPress 扫描器经常请求带扩展名的路径；显式纳入 middleware，
    // 让它们在进入动态 Notion 路由前直接返回 404。
    '/wp-admin/:path*',
    '/:locale/wp-admin/:path*',
    '/wp-login.php',
    '/:locale/wp-login.php',
    '/xmlrpc.php',
    '/:locale/xmlrpc.php',
    '/wp-json/:path*',
    '/:locale/wp-json/:path*',
    '/wp-content/:path*',
    '/:locale/wp-content/:path*',
    '/wp-includes/:path*',
    '/:locale/wp-includes/:path*',
    '/((?!_next|sign-in|auth).*\\.php.*)',
    // Catch-all 占位符（如 [...slug]）包含点号，不会命中上面的通用 matcher。
    '/((?!_next|sign-in|auth).*\\[.*\\].*)'
  ]
}

const blockedProbePath = (pathname: string): boolean => {
  const normalizedPath = String(pathname || '').replace(/\/{2,}/g, '/')
  return (
    /\/(?:wp-admin|wp-json|wp-content|wp-includes)(?:\/|$)/i.test(
      normalizedPath
    ) ||
    /\/(?:wp-login|xmlrpc)\.php(?:\/|$)/i.test(normalizedPath) ||
    /\.php(?:\/|$)/i.test(normalizedPath)
  )
}

const containsDynamicRoutePlaceholder = (pathname: string): boolean => {
  let decodedPathname = pathname
  try {
    decodedPathname = decodeURIComponent(pathname)
  } catch {
    // 保留原始路径；格式错误的转义字符不应让 middleware 本身抛出异常。
  }

  return decodedPathname
    .split('/')
    .some(segment =>
      /^(?:\[(?:\.\.\.)?[^\[\]/]+\]|\[\[(?:\.\.\.)?[^\[\]/]+\]\])$/.test(
        segment
      )
    )
}

const notFoundResponse = (): NextResponse =>
  new NextResponse('Not Found', {
    status: 404,
    headers: {
      'Cache-Control':
        'public, max-age=60, s-maxage=3600, stale-while-revalidate=86400',
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Robots-Tag': 'noindex'
    }
  })

const shouldHandleHeadInApplication = (pathname: string): boolean => {
  const normalizedPath = String(pathname || '').replace(/\/{2,}/g, '/')
  // 同时识别带 locale 前缀的受保护路由，避免绕过 API 或鉴权逻辑。
  return /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:api|trpc|dashboard|admin|user)(?:\/|$)/i.test(
    normalizedPath
  )
}

const getEarlyResponse = (req: NextRequest): NextResponse | null => {
  const { pathname } = req.nextUrl

  if (blockedProbePath(pathname) || containsDynamicRoutePlaceholder(pathname)) {
    return notFoundResponse()
  }

  if (req.method === 'HEAD' && !shouldHandleHeadInApplication(pathname)) {
    return new NextResponse(null, {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=0, s-maxage=3600'
      }
    })
  }

  return null
}

// 限制登录访问的路由
const isTenantRoute = createRouteMatcher([
  '/user/organization-selector(.*)',
  '/user/orgid/(.*)',
  '/dashboard',
  '/dashboard/(.*)'
])

// 限制权限访问的路由
const isTenantAdminRoute = createRouteMatcher([
  '/admin/(.*)/memberships',
  '/admin/(.*)/domain'
])

/**
 * 没有配置权限相关功能的返回
 * @param req
 * @param ev
 * @returns
 */
// eslint-disable-next-line @typescript-eslint/require-await, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
const noAuthMiddleware = async (req: NextRequest, ev: any) => {
  const earlyResponse = getEarlyResponse(req)
  if (earlyResponse) {
    return earlyResponse
  }

  // 如果没有配置 Clerk 相关环境变量，返回一个默认响应或者继续处理请求
  if (BLOG['UUID_REDIRECT']) {
    let redirectJson: Record<string, string> = {}
    try {
      const response = await fetch(`${req.nextUrl.origin}/redirect.json`)
      if (response.ok) {
        redirectJson = (await response.json()) as Record<string, string>
      }
    } catch (err) {
      console.error('Error fetching static file:', err)
    }
    let lastPart = getLastPartOfUrl(req.nextUrl.pathname) as string
    if (checkStrIsNotionId(lastPart)) {
      lastPart = idToUuid(lastPart)
    }
    if (lastPart && redirectJson[lastPart]) {
      const redirectToUrl = req.nextUrl.clone()
      redirectToUrl.pathname = '/' + redirectJson[lastPart]
      console.log(
        `redirect from ${req.nextUrl.pathname} to ${redirectToUrl.pathname}`
      )
      return NextResponse.redirect(redirectToUrl, 308)
    }
  }
  return NextResponse.next()
}
/**
 * 鉴权中间件
 */
const authMiddleware = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  ? clerkMiddleware((auth, req) => {
      const earlyResponse = getEarlyResponse(req)
      if (earlyResponse) {
        return earlyResponse
      }

      const { userId } = auth()
      // 处理 /dashboard 路由的登录保护
      if (isTenantRoute(req)) {
        if (!userId) {
          // 用户未登录，重定向到 /sign-in
          const url = new URL('/sign-in', req.url)
          url.searchParams.set('redirectTo', req.url) // 保存重定向目标
          return NextResponse.redirect(url)
        }
      }

      // 处理管理员相关权限保护
      if (isTenantAdminRoute(req)) {
        auth().protect(has => {
          return (
            has({ permission: 'org:sys_memberships:manage' }) ||
            has({ permission: 'org:sys_domains_manage' })
          )
        })
      }

      // 默认继续处理请求
      return NextResponse.next()
    })
  : noAuthMiddleware

export default authMiddleware
