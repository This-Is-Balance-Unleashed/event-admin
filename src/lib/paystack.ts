import { createServerFn } from "@tanstack/react-start";
import { fetchPaystackTransactionsHandler } from "./paystack-handler";

export type { PaystackTransaction, PaystackMeta, PaystackResponse } from "./paystack-handler";

export { fetchPaystackTransactionsHandler } from "./paystack-handler";

export const fetchPaystackTransactions = createServerFn()
  .inputValidator((input: { page: number; perPage: number }) => input)
  .handler(fetchPaystackTransactionsHandler);
