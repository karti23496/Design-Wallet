/* ⛔ NOT THE SCRIPT TO PASTE. Superseded 2026-09-16.
 *
 * Portfolio submissions are now handled by the SAME Apps Script deployment as
 * the salary form. The code to paste lives in:
 *
 *     salary/submit/google-apps-script.js
 *
 * ...which routes on `form=portfolio` (POST) and `type=portfolios` (GET). Its
 * portfolio section writes to the "List of design portfolio" tab exactly as
 * this file did, plus `migratePortfolioStatuses()`.
 *
 * WHY THIS FILE IS GONE: portfolio submissions had their own deployment, and
 * that deployment was at some point overwritten with the salary script's code,
 * so every submission was posted into the salary handler and silently dropped.
 * Two projects meant two things to keep in sync and one that could be replaced
 * by mistake. One deployment removes that failure entirely.
 *
 * Keeping the file as a signpost rather than deleting it, so that anyone who
 * goes looking for "the portfolio Apps Script" is sent to the right place
 * instead of pasting a second, competing doPost.
 */
