import BLOG from '@/blog.config'
import { siteConfig } from '@/lib/config'
import { DynamicLayout } from '@/themes/theme'

// 404 页面不应依赖 Notion。未知路径可能来自爬虫或漏洞扫描，
// 如果这里再次拉取全站数据，每个 404 都会触发一次昂贵的 Notion 请求。
const STATIC_404_PROPS = {
  siteInfo: {
    title: BLOG.AUTHOR || 'NotionNext BLOG',
    description: BLOG.BIO || '',
    pageCover: BLOG.HOME_BANNER_IMAGE || '/bg_image.jpg',
    icon: BLOG.BLOG_FAVICON || '/avatar.svg',
    link: BLOG.LINK
  },
  NOTION_CONFIG: {},
  categoryOptions: [],
  tagOptions: [],
  allNavPages: [],
  allLinkPages: [],
  customNav: [],
  customMenu: [],
  allMembers: [],
  allEvents: [],
  notice: null,
  allPages: [],
  posts: [],
  latestPosts: [],
  recommendPosts: [],
  prev: null,
  next: null,
  collection: [],
  collectionQuery: {},
  collectionView: {},
  viewIds: [],
  block: {},
  schema: {},
  postCount: 0
}

/**
 * 404
 * @param {*} props
 * @returns
 */
const NoFound = props => {
  const theme = siteConfig('THEME', BLOG.THEME, props.NOTION_CONFIG)
  return <DynamicLayout theme={theme} layoutName='Layout404' {...props} />
}

export async function getStaticProps() {
  return { props: STATIC_404_PROPS }
}

export default NoFound
