# Initial Tmall Seller Center Recon Strategy

Date: 2026-07-16

Scope: read-only exploration of the logged-in `https://myseller.taobao.com/home.htm/QnworkbenchHome/` page in the user's `9222` CDP browser.

## Read-Only Boundary

- Allowed: target listing, DOM/runtime-state reads, visible text snapshots, `window.$qnMenus` extraction, `performance` resource summarization, local file exports.
- Not allowed: button clicks for submit/save/delete/publish/refund/upload/signup, form submission, API replay of mutation-risk endpoints, cookie/localStorage/session export, raw signed URL persistence.

## First Findings

- The page exposes a large menu tree as `window.$qnMenus`.
- The first bounded snapshot found 269 flattened menu nodes across 首页、营销、交易、商品、物流、推广、客服、店铺、私域、财务、金融、数据、服务.
- The loaded-resource snapshot found MTOP/H5 API names for seller home widgets, menu loading, todo counts, calendar, seller info cards, finance card, ads, and diagnostics.
- At least one loaded API name contains a mutation-like verb: `mtop.taobao.multi.resource.menu.common.operate`; it is cataloged as blocked.

## Next Extension Points

- Add focused read commands only after comparing CLI output to the visible page or a safe page-owned state object.
- For product, trade, logistics, finance, and campaign domains, prefer menu/state extraction first, then one read endpoint at a time.
- Store fixtures with redacted request/response fields only.
