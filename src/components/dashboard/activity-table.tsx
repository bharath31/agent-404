import type { ActivityItem } from "@/data/dashboard";
import { ArrowRightIcon } from "./icons";
import { formatDate, pathFromUrl } from "./ui";
import styles from "./dashboard.module.css";

export function ActivityTable({ items, compact = false }: { items: ActivityItem[]; compact?: boolean }) {
	if (!items.length) return <div className={styles.tableEmpty}><p>No recovery requests match this view.</p><small>Try a longer time range or remove a filter.</small></div>;
	return <div className={styles.tableScroll}>
		<table className={styles.activityTable}>
			<thead><tr><th>Request</th><th>Agent</th><th>Outcome</th>{compact ? null : <th>Latency</th>}<th>Time</th></tr></thead>
			<tbody>{items.map((item) => <tr key={item.id}>
				<td><div className={styles.routeCell}><code title={item.deadUrl}>{pathFromUrl(item.deadUrl)}</code>{item.recoveredUrl ? <span><ArrowRightIcon size={11}/><code title={item.recoveredUrl}>{pathFromUrl(item.recoveredUrl)}</code></span> : item.suggestedUrls[0] ? <span><ArrowRightIcon size={11}/><code title={item.suggestedUrls[0]}>{pathFromUrl(item.suggestedUrls[0])}</code></span> : null}</div></td>
				<td><span className={styles.agentPill}>{agentLabel(item.agentCategory)}</span></td>
				<td><span className={`${styles.outcome} ${item.recovered ? styles.outcomeRecovered : styles.outcomePending}`}><i />{item.recovered ? "Followed" : item.suggestedUrls.length ? "Suggested" : "Unmatched"}</span></td>
				{compact ? null : <td className="mono">{item.recoveryLatencyMs == null ? "—" : item.recoveryLatencyMs < 1000 ? `${item.recoveryLatencyMs} ms` : `${(item.recoveryLatencyMs / 1000).toFixed(1)} s`}</td>}
				<td><time dateTime={item.createdAt}>{formatDate(item.createdAt, "full")}</time></td>
			</tr>)}</tbody>
		</table>
	</div>;
}

function agentLabel(value: ActivityItem["agentCategory"]): string {
	if (value === "browser_agent") return "Browser agent";
	if (value === "crawler") return "Crawler";
	return "Human";
}
