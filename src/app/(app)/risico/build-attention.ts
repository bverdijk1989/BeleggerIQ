// BC shim: de daadwerkelijke implementatie leeft in
// `src/lib/analytics/attention.ts` zodat zowel /risico als het dashboard
// dezelfde prioritering gebruiken.
export {
  buildAttentionItems,
  countAttentionBySeverity,
  type AttentionItem,
  type AttentionSeverity,
} from "@/lib/analytics/attention";
