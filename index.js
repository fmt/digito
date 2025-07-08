const gtm = `<!-- Google Tag Manager --> 
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start': 
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0], 
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src= 
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f); 
})(window,document,'script','dataLayer','GTM-N3SFPG2');</script> 
<!-- End Google Tag Manager --> 
`

const clarity = `
<script type="text/javascript">
(function(c,l,a,r,i,t,y){
  c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
  t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
  y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
})(window, document, "clarity", "script", "r1z98n5f2p");
</script>
`

const mailchimp = `<script id="mcjs">!function(c,h,i,m,p){m=c.createElement(h),p=c.getElementsByTagName(h)[0],m.async=1,m.src=i,p.parentNode.insertBefore(m,p)}(document,"script","https://chimpstatic.com/mcjs-connected/js/users/d5fb2aa3261cb428560b6f335/0c71fe0590aa0a3ff0f874765.js");</script>`

addEventListener("fetch", async event => {
  event.passThroughOnException()
  if(/(dl.digito|favicon.ico)/.test(event.request.url) !== false) event.respondWith(handleAssets(event.request))
  if(/(www.digito)/.test(event.request.url) !== false) event.respondWith(handleRequest(event.request))
  if(/(cursos.digito)/.test(event.request.url) !== false) event.respondWith(redirect('https://www.evolui.com/', 302))
})

/**
 * Respond with hello worker text
 * @param {Request} request
 */
async function handleRequest(req) {
  const reqUrl = req.url
  const reqUrlParts = new URL(reqUrl)
  const { pathname, search, hash } = reqUrlParts
  const base = 'http://www.digito.pt'
  const fetchUrl = base + pathname + search + hash;

  let checkHash = await __arc.get(pathname)
  if(checkHash === null) {
    console.log('html not on arc:' + pathname)

    let arcJsonUrl = await fetch('https://archive.org/wayback/available?timestamp=20031231&url=' + encodeURI(fetchUrl));
    let arcJson = await arcJsonUrl.json()

    if(arcJson.archived_snapshots.closest !== undefined && arcJson.archived_snapshots.closest.url) {
      // You can retrieve an unmodified copy of HTML documents from the Wayback Machine by appending id_ to the snapshot date/time in the URL.
      // Raw original: https://web.archive.org/web/20180101010338id_/http://www.example.com:80/
      let arcFetchUrl = arcJson.archived_snapshots.closest.url.replace("/" + base, "id_/" + base)
      let arcFetch = await fetch(arcFetchUrl);

      // using Buffer to convert ISO-8859-1 to UTF-8
      // https://github.com/sunyuting83/online-books-workers/blob/master/index.js
      // https://community.cloudflare.com/t/textdecoder-doesnt-support-any-legacy-charsets/222141
      let arcFetchBuffer = await arcFetch.arrayBuffer()
      let arcHtml = new Uint8Array(arcFetchBuffer)
      arcHtml = String.fromCharCode(...arcHtml)

      await __arc.put(pathname, arcHtml)
      console.log('html new arc:', pathname);

      return new Response(arcHtml, {
        status: 200,
        statusText: 'OK',
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'text/html;charset=utf-8'
        }
      })

    }

    return new Response('404 Not Found', {
      status: 404,
      statusText: 'Not Found',
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'text/plain;charset=utf-8'
      }
    })

  }

  checkHash = checkHash.replace(/<head>/i, '<head>' + clarity)
  checkHash = checkHash.replace(/http:\/\/dl.digito.pt/g, 'https://dl.digito.pt')
  checkHash = checkHash.replace(/<!-- ini pub -->([\s\S]*?)<!-- end pub -->|<!-- ini pub minibanner 120x60 -->([\s\S]*?)<!-- end pub minibanner 120x60 -->|<!footer!>([\s\S]*?)<!-end footer>|<!-- ini mailing-list -->([\s\S]*?)<!-- end mailing-list -->/gm, '')

  checkHash = checkHash.replace(/<form action="\/pesquisa\/" method="post" name="pesquisa">/g, '<form action="https:\/\/www.google.pt\/search" method="get" name="pesquisa"><input type="hidden" name="sitesearch" value="https:\/\/www.digito.pt">')
  checkHash = checkHash.replace(/name="query"/g, 'name="q"')

  checkHash = checkHash.replace(/<\/body>/g, mailchimp + '<\/body>')

  return new Response(checkHash, {
    status: 200,
    statusText: 'OK',
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'text/html;charset=utf-8'
    }
  })

}

async function serveAsset(event) {
  const url = new URL(event.request.url)
  const cache = caches.default
  let response = await cache.match(event.request)

  if (!response) {
    response = await fetch(`${BUCKET_URL}${url.pathname}`)
    const headers = { "cache-control": "public, max-age=14400" }
    response = new Response(response.body, { ...response, headers })
    event.waitUntil(cache.put(event.request, response.clone()))
  }
  return response
}

/**
 * Respond with hello worker text
 * @param {Request} request
 */
async function handleAssets(req) {
  const reqUrl = req.url
  const reqUrlParts = new URL(reqUrl)
  const { pathname, search, hash } = reqUrlParts
  const isIco = /(ico)/.test(pathname)
  const base = isIco ? 'http://www.digito.pt' : 'http://dl.digito.pt'
  const fetchUrl = base + pathname + search + hash;

  let checkHash = await __arc.get(pathname, 'stream')

  if(checkHash === null) {
    console.log('asset not on arc:' + pathname)

    let arcJsonUrl = await fetch('https://archive.org/wayback/available?url=' + encodeURI(fetchUrl) + (isIco ? '&timestamp=20010720041445' : ''));
    let arcJson = await arcJsonUrl.json()

    if(arcJson.archived_snapshots.closest !== undefined && arcJson.archived_snapshots.closest.url) {
      let arcFetchUrl = arcJson.archived_snapshots.closest.url.replace("/" + base, "id_/" + base)

      let arcFetch = await fetch(arcFetchUrl);
      let arcFetchBuffer = await arcFetch.clone().body
      let contentType = arcFetch.headers.get('content-type')

      // https://community.cloudflare.com/t/in-a-cloudflare-worker-how-would-you-capture-a-file-upload-from-a-post-request-and-just-store-it-in-kv-best-practice-for-storing-images-in-kv/168720/3
      // https://github.com/ilikedata/cloudflare-workers-kv-cache
      await __arc.put(pathname, arcFetchBuffer, {metadata: {contentType: contentType}})

      console.log('new asset arc:', pathname);
      return arcFetch.clone()
    }

    console.log('Asset 404:', pathname)
    return fetch('https://dummyimage.com/1x1/ffffff/?text=%20')

  }
  let response = new Response(checkHash);
  if(/(jpeg|jpg)/.test(pathname) !== false) response.headers.set('Content-Type', 'image/jpeg')
  if(/(gif)/.test(pathname) !== false) response.headers.set('Content-Type', 'image/gif')
  if(/(png)/.test(pathname) !== false) response.headers.set('Content-Type', 'image/png')
  if(/(ico)/.test(pathname) !== false) response.headers.set('Content-Type', 'image/x-icon')
  return response

}

