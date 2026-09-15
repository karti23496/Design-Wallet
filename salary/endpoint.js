/**
 * endpoint.js — the one place the Know your money web app URL lives.
 *
 * Paste the /exec URL of the deployed salary/submit/google-apps-script.js here.
 * Both pages read it: /salary/submit/ POSTs submissions to it, and /salary/
 * GETs the live community figures from it. Empty means neither is switched on:
 * the form says submissions aren't open, and the dashboard shows the research
 * figures alone.
 */
var DW_SALARY_ENDPOINT = "https://script.google.com/macros/s/AKfycbwySiHlzi9qQ4n3iNnq0Kx4GlNwEj6zNZAXHEBa43Yvc4plE8U-HKiSLamxQcchEbvWFA/exec";
