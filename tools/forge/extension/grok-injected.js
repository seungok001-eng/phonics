// StudioForge Flow Bridge - Grok Injected (MAIN world)
// grok.com/imagine 의 fetch/XHR 응답을 가로채 prompt ↔ mediaUrl 매핑을 추출.
// content.js 와 동일한 sf-flow-bridge 채널을 쓰되, type 을 'GROK_CAPTURE' 로 분리.

(() => {
  if (window.__SF_GROK_INJECTED__) return;
  window.__SF_GROK_INJECTED__ = true;

  const CHANNEL = "sf-flow-bridge";
  const TYPE = "GROK_CAPTURE";
  const TARGET_URL_PATTERNS = [
    "/rest/media/post/list",
    "/rest/media/post/get",
    "/rest/media/post/create",
    "/rest/media/video/upscale",
  ];

  function shouldIntercept(url) {
    try {
      const u = String(url || "");
      return TARGET_URL_PATTERNS.some((p) => u.includes(p));
    } catch {
      return false;
    }
  }

  function emit(payload) {
    try {
      window.postMessage(
        { __sfChannel: CHANNEL, type: TYPE, ...payload },
        "*",
      );
    } catch (e) {
      console.warn("[Grok Bridge] emit failed", e);
    }
  }

  // 응답 본문에서 posts[] 추출 → 각 post 의 prompt + mediaUrl(hd 우선) 추출.
  function extractItemsFromResponse(json) {
    if (!json || typeof json !== "object") return [];
    const items = [];
    const visit = (post) => {
      if (!post || typeof post !== "object") return;
      const prompt = post.prompt || post.title || "";
      const isVideo =
        post.mediaType === "MEDIA_POST_TYPE_VIDEO" ||
        (post.mimeType && /video\//.test(post.mimeType)) ||
        (post.mediaUrl && /\.mp4(\?|$)/i.test(post.mediaUrl));
      const url = post.hdMediaUrl || post.mediaUrl || null;
      if (url && prompt) {
        items.push({
          url,
          prompt,
          mediaType: isVideo ? "video" : "image",
          id: post.id || null,
          mimeType: post.mimeType || null,
        });
      }
      if (Array.isArray(post.childPosts)) {
        for (const c of post.childPosts) visit(c);
      }
    };
    if (Array.isArray(json.posts)) {
      for (const p of json.posts) visit(p);
    } else if (json.post) {
      visit(json.post);
    } else if (Array.isArray(json.items)) {
      for (const p of json.items) visit(p);
    } else {
      // 단일 객체 응답 (post create 등)
      visit(json);
    }
    return items;
  }

  // ----- fetch 래퍼 -----
  const _fetch = window.fetch;
  window.fetch = async function (...args) {
    const req = args[0];
    const url = typeof req === "string" ? req : req?.url || "";
    const intercepted = shouldIntercept(url);

    let resp;
    try {
      resp = await _fetch.apply(this, args);
    } catch (e) {
      if (intercepted) {
        emit({ phase: "error", url, status: 0, message: String(e?.message || e) });
      }
      throw e;
    }

    if (intercepted) {
      try {
        const clone = resp.clone();
        if (resp.ok) {
          // body 비동기 파싱 — 원본 응답 흐름에 영향 X
          clone
            .json()
            .then((json) => {
              const items = extractItemsFromResponse(json);
              if (items.length > 0) {
                emit({ phase: "response", url, items, at: Date.now() });
              }
            })
            .catch(() => {});
        } else {
          emit({ phase: "error", url, status: resp.status });
        }
      } catch (e) {
        // 무시 — 응답 인터셉트는 best-effort
      }
    }

    return resp;
  };

  // ----- XHR 래퍼 -----
  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__sfGrokUrl = url;
    this.__sfGrokIntercept = shouldIntercept(url);
    return _open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    if (this.__sfGrokIntercept) {
      this.addEventListener("load", () => {
        try {
          if (this.status >= 200 && this.status < 300) {
            const text = this.responseType === "" || this.responseType === "text"
              ? this.responseText
              : null;
            if (text) {
              const json = JSON.parse(text);
              const items = extractItemsFromResponse(json);
              if (items.length > 0) {
                emit({
                  phase: "response",
                  url: this.__sfGrokUrl,
                  items,
                  at: Date.now(),
                });
              }
            }
          } else {
            emit({
              phase: "error",
              url: this.__sfGrokUrl,
              status: this.status,
            });
          }
        } catch {}
      });
    }
    return _send.apply(this, arguments);
  };

  console.log("[Grok Bridge] injected — fetch/XHR 인터셉터 활성");
})();
