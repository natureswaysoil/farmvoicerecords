import { NextResponse } from "next/server";
import { isQuickBooksApiError, qboRequest } from "@/src/lib/quickbooks";
import {
  getValidQuickBooksAccessToken,
  logQuickBooksError,
} from "@/src/lib/quickbooks-server";

export const runtime = "nodejs";

type TestResult = {
  name: "syntax" | "validation";
  passed: boolean;
  status: number | null;
  intuitTid: string | null;
  code: string | null;
  message: string;
};

async function runExpectedErrorTest(args: {
  name: "syntax" | "validation";
  query: string;
  ctx: Awaited<ReturnType<typeof getValidQuickBooksAccessToken>>;
}): Promise<TestResult> {
  const endpoint = `/query?query=${encodeURIComponent(args.query)}`;

  try {
    await qboRequest(
      args.ctx.connection.realm_id,
      args.ctx.accessToken,
      endpoint
    );

    return {
      name: args.name,
      passed: false,
      status: 200,
      intuitTid: null,
      code: null,
      message: "QuickBooks unexpectedly accepted the intentionally invalid query.",
    };
  } catch (error) {
    const logged = await logQuickBooksError({
      supabase: args.ctx.supabase,
      farmId: args.ctx.farmId,
      operation: `error_handling_test_${args.name}`,
      endpoint: "/query",
      error,
      context: { testType: args.name, readOnly: true },
    });

    if (!isQuickBooksApiError(error)) {
      return {
        name: args.name,
        passed: false,
        status: null,
        intuitTid: logged.intuitTid,
        code: logged.code,
        message: logged.message,
      };
    }

    return {
      name: args.name,
      passed: !error.reconnectRequired && error.status !== null && error.status >= 400,
      status: error.status,
      intuitTid: error.intuitTid,
      code: error.code,
      message: error.message,
    };
  }
}

export async function POST() {
  try {
    const ctx = await getValidQuickBooksAccessToken();

    const results = await Promise.all([
      runExpectedErrorTest({
        name: "syntax",
        query: "select from Employee",
        ctx,
      }),
      runExpectedErrorTest({
        name: "validation",
        query: "select FarmVoiceDefinitelyNotAField from Employee maxresults 1",
        ctx,
      }),
    ]);

    const passed = results.every((item) => item.passed);

    return NextResponse.json({
      passed,
      readOnly: true,
      message: passed
        ? "QuickBooks API error handling test passed."
        : "One or more QuickBooks API error handling checks did not behave as expected.",
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        passed: false,
        readOnly: true,
        error: error instanceof Error ? error.message : "QuickBooks error-handling test failed.",
        reconnectRequired:
          isQuickBooksApiError(error) ? error.reconnectRequired : false,
      },
      { status: 400 }
    );
  }
}
