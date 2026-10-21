# ACME Explorer

A minimal, read-only ACME Protocol explorer for Bitcoin Mainnet and Testnet. This is the complete static website, ready for GitHub Pages. It uses public ACME APIs and does not require a ChatGPT account, API key, database, server, or build process.

## Included features

- Mainnet/Testnet switch, light/dark theme, and explorer search.
- Scrolling homepage with network statistics, latest 20 blocks, latest transactions, latest 20 artwork assets, DEX tokens, and mempool events.
- Dedicated blocks, transactions, assets, tokens, and mempool pages.
- Visual/table block views with ACME transaction indicators and block-wide fee rates from mempool.space.
- Asset cards with name, artist, and ACME ID; half-width asset preview and storage metadata on detail pages.
- Cortex axons, dendrites, and tags, paginated at five items per column.
- Viewport-based artwork loading and retry controls.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page shell and navigation |
| `app.js` | Routing, public API calls, and explorer behavior |
| `style.css` | Base styles |
| `minimal.css` | Current minimal theme and responsive layout |
| `acme-line-logo.svg` | Outlined ACME logo |
| `CNAME` | Custom hostname for branch-based GitHub Pages |
| `.nojekyll` | Serve files directly, without Jekyll |

## 1. Create the repository

Create a **public** repository under **SockIts** named **acme-explorer**. Initialize it with a README if you want ChatGPT's GitHub connection to upload the prepared files. If the connection has access to selected repositories only, add this new repository to its allowed repositories.

Upload the contents of this folder into the repository root. `index.html` must be at the root; do not upload the enclosing folder as another directory. Keep the hidden `.nojekyll` file. The prepared `.gitignore` excludes local and hosted-platform state.

The current source came from the explorer version at commit `2f66eac499c2966da1390367cb6e3e19aee0053e`. Hosting credentials, platform configuration, and private account data are not included.

## 2. Enable GitHub Pages

In the **new explorer repository**, open **Settings → Pages**:

1. Under **Build and deployment**, choose **Deploy from a branch**.
2. Choose **main** and **/(root)**, then click **Save**.
3. Wait for the **pages build and deployment** run to succeed in **Actions**.
4. Under **Custom domain**, enter `explorer.acmeprotocol.com` and click **Save**. The prepared `CNAME` contains this same hostname, but you still need to configure the domain in Pages settings.

Do not change the existing `acme-token-dashboard` repository or its `acmeprotocol.com` custom domain. Do not change DNS until the explorer's Pages deployment succeeds.

## 3. Change one DNS record in GoDaddy

Edit the existing **explorer CNAME**, replacing its current target:

| Setting | Value |
| --- | --- |
| Type | CNAME |
| Name / Host | explorer |
| Current target | custom-domains.chatgpt.site |
| New target | sockits.github.io |
| TTL | 600 seconds, or the current default |

Use only `sockits.github.io` as the target: no `https://`, path, or repository name.

Keep the four `@` A records and the `www → sockits.github.io` CNAME exactly as they are. Those serve the main website.

Keep the existing OpenAI/Cloudflare verification TXT records during the cutover. They can be removed later, after you confirm the explorer is served by GitHub Pages and detach the old Sites custom domain. Do not delete unrelated TXT records.

## 4. Finish HTTPS and verify

Back in **Settings → Pages**, wait for the DNS check and HTTPS certificate to complete, then enable **Enforce HTTPS**. GitHub notes this option can take up to 24 hours to become available after custom-domain changes.

Open `https://explorer.acmeprotocol.com` in a private browser window and on cellular data. Confirm:

- No ChatGPT sign-in or account-connection prompt appears.
- Home, Blocks, Transactions, Assets, ACME Token, and Mempool open correctly.
- Mainnet and Testnet both load data.
- The Visual/Table block toggle works.
- An asset such as LATENIGHT shows artist, ACME ID, storage, artwork, and Cortex data.
- An artist such as MEGANO shows five dendrites per page with working arrows.

If the old page appears, wait for DNS caches to expire. On Windows you can run `ipconfig /flushdns`, close Chrome completely, then reopen it.

After the GitHub-hosted site works, detach `explorer.acmeprotocol.com` from its old Sites hosting configuration. The old generated Sites URL can remain as a backup. Never point DNS to GitHub before the new Pages site is configured for this hostname.

## Local preview

From this directory, run:

```sh
python -m http.server 4173
```

Then open `http://localhost:4173`. Node.js is optional; when installed, validate JavaScript syntax with:

```sh
node --check app.js
```

## Future updates

Edit the files, commit, and push to `main`; GitHub Pages will redeploy automatically. For reviewed updates, create a branch and pull request, then merge into `main`.

After the repository exists and is allowed in your GitHub connection, ChatGPT can use the GitHub tools to read files, create commits, push branch updates, and prepare pull requests. Changes to GitHub Pages settings or DNS may still need to be made in their respective dashboards.

Public data sources:

- Mainnet: https://acme.pics
- Testnet: https://fakefull.art
- Block fee rates: https://mempool.space
- Fonts: Google Fonts

The browser fetches these sources directly. Source outages, CORS policies, indexing delays, or thumbnail-rendering failures can affect live data independently of GitHub Pages. The UI includes unavailable states and artwork retries.

## Official setup references

- https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site
