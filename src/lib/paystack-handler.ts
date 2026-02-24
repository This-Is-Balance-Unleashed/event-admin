export type PaystackTransaction = {
  id: number;
  reference: string;
  amount: number; // in kobo
  status: "success" | "failed" | "abandoned";
  channel: string;
  paid_at: string | null;
  customer: {
    email: string;
    first_name?: string;
    last_name?: string;
  };
};

export type PaystackMeta = {
  total: number;
  skipped: number;
  perPage: number;
  page: number;
  pageCount: number;
};

export type PaystackResponse = {
  status: boolean;
  data: PaystackTransaction[];
  meta: PaystackMeta;
};

export async function fetchPaystackTransactionsHandler({
  data,
}: {
  data: { page: number; perPage: number };
}): Promise<PaystackResponse> {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not set");

  const res = await fetch(
    `https://api.paystack.co/transaction?perPage=${data.perPage}&page=${data.page}`,
    {
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
    },
  );

  if (!res.ok) {
    throw new Error(`Paystack API error: ${res.status}`);
  }

  return res.json() as Promise<PaystackResponse>;
}
