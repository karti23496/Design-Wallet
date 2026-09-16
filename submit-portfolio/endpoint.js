/* The Apps Script web app behind portfolio submissions.
 *
 * This is deliberately THE SAME deployment as salary/endpoint.js. One script
 * serves both forms and tells them apart by an explicit field: the portfolio
 * form posts `form=portfolio`, and the wall reads `?type=portfolios`.
 *
 * WHY (2026-09-16): the portfolio form used to have its own deployment, and
 * that deployment was at some point overwritten with the salary script's code.
 * Portfolio submissions were then posted into the salary handler, rejected,
 * and silently lost — invisible, because the form posts with `mode: "no-cors"`
 * and so cannot read any response. Sharing one deployment removes the whole
 * class of failure: there is no second URL left to drift.
 *
 * Keep this value identical to DW_SALARY_ENDPOINT in salary/endpoint.js.
 * Changing the script's code changes nothing that is live until it is
 * redeployed as a NEW version.
 */
window.DESIGN_WALLET_PORTFOLIO_SUBMISSION_URL =
    "https://script.google.com/macros/s/AKfycbwySiHlzi9qQ4n3iNnq0Kx4GlNwEj6zNZAXHEBa43Yvc4plE8U-HKiSLamxQcchEbvWFA/exec";
