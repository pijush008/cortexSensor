"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ApiResponse } from "@/lib/api";
import type { InvoiceRecord, SubscriptionPlanView } from "@/types";

export function useSubscriptionPlan() {
  return useQuery({
    queryKey: ["subscription", "plan"],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<SubscriptionPlanView>>(
        "/subscription/plan",
      );
      return data.data;
    },
  });
}

export function useSubscriptionInvoices() {
  return useQuery({
    queryKey: ["subscription", "invoices"],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<InvoiceRecord[]>>(
        "/subscription/invoices",
      );
      return (data.data as InvoiceRecord[]) || [];
    },
  });
}

export function useSwitchPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (planCode: string) => {
      const { data } = await api.post<ApiResponse<{ plan: string }>>(
        "/subscription/plan",
        { planCode },
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
    },
  });
}

export function downloadInvoice(invoiceNo: string) {
  return api.post(`/subscription/invoices/${invoiceNo}/download`, {}, {
    responseType: "blob",
  });
}