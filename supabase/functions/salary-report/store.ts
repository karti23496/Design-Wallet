// A thin PostgREST client, behind an interface so the handler can be tested
// against an in-memory copy (handler_test.ts) with the exact same query strings.
//
// Every call here uses the SERVICE ROLE key, which exists only inside the Edge
// Function. The browser never sees it.

export type Row = Record<string, unknown>;

export interface Db {
    /** `query` is a PostgREST query string, e.g. "email=eq.a@b.co&order=created_at.desc&limit=1". */
    select(table: string, query: string): Promise<Row[]>;
    count(table: string, query: string): Promise<number>;
    insert(table: string, row: Row): Promise<Row[]>;
    /** Returns the rows that matched AND changed. An empty array means "someone got there first". */
    patch(table: string, query: string, body: Row): Promise<Row[]>;
}

export function restDb(baseUrl: string, serviceKey: string): Db {
    const headers = {
        apikey: serviceKey,
        Authorization: "Bearer " + serviceKey,
        "Content-Type": "application/json",
    };
    const url = (table: string, query = "") => `${baseUrl}/rest/v1/${table}${query ? "?" + query : ""}`;

    async function must(res: Response, what: string): Promise<Response> {
        if (!res.ok) throw new Error(`${what} failed: ${res.status} ${await res.text()}`);
        return res;
    }

    return {
        async select(table, query) {
            return await (await must(await fetch(url(table, query), { headers }), "select " + table)).json();
        },
        async count(table, query) {
            const res = await must(
                await fetch(url(table, query + "&select=id"), { method: "HEAD", headers: { ...headers, Prefer: "count=exact" } }),
                "count " + table,
            );
            // content-range looks like "0-4/5" or "*/0"
            return Number((res.headers.get("content-range") || "").split("/")[1]) || 0;
        },
        async insert(table, row) {
            return await (await must(
                await fetch(url(table), { method: "POST", headers: { ...headers, Prefer: "return=representation" }, body: JSON.stringify(row) }),
                "insert " + table,
            )).json();
        },
        async patch(table, query, body) {
            return await (await must(
                await fetch(url(table, query), { method: "PATCH", headers: { ...headers, Prefer: "return=representation" }, body: JSON.stringify(body) }),
                "patch " + table,
            )).json();
        },
    };
}
