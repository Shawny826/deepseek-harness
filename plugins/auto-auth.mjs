/**
 * Auto Authentication & Fixed Token Plugin for DeepSeek Harness Web
 * Allows passwordless/tokenless entry from local browsers (auto-mints session cookie)
 * and supports configuring a fixed launch token.
 */

export const name = 'auto-auth';
export const inject = ['connection'];

export function apply(ctx, config = {}) {
  const init = () => {
    try {
      const connection = ctx.connection;
      if (!connection || !connection.browserAuth) return;

      const browserAuth = connection.browserAuth;

      // 1. 固定 Token（若配置了 fixedToken 或环境变量 DSH_TOKEN）
      const fixedToken = config.fixedToken || process.env.DSH_TOKEN;
      if (fixedToken) {
        browserAuth.launchToken = fixedToken;
      }

      // 2. 免 Token 自动登录（默认开启）
      const autoLogin = config.autoLogin !== false;
      if (autoLogin && !browserAuth.__autoAuthPatched) {
        browserAuth.__autoAuthPatched = true;
        const originalAuthorizeIndex = browserAuth.authorizeIndex.bind(browserAuth);
        browserAuth.authorizeIndex = function (req, res) {
          try {
            if (browserAuth.isAuthenticated(req)) {
              return originalAuthorizeIndex(req, res);
            }
            const url = new URL(req.url ?? '/', 'http://dsh.invalid');
            if (url.searchParams.has('token')) {
              return originalAuthorizeIndex(req, res);
            }
            // 当用户直接访问根路径且未携带 token/cookie 时，自动注入 launchToken 进行 303 登录重定向并签发 Cookie
            if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
              req.url = `/?token=${browserAuth.launchToken}`;
            }
          } catch (err) {
            console.error('[auto-auth] Error in authorizeIndex wrapper:', err);
          }
          return originalAuthorizeIndex(req, res);
        };
      }
    } catch (err) {
      console.error('[auto-auth] Failed to initialize:', err);
    }
  };

  init();
  ctx.on('ready', init);
}
