import type { RecoverySeriesPoint } from "@/data/dashboard";
import styles from "./dashboard.module.css";

export function RecoveryChart({ points, compact = false }: { points: RecoverySeriesPoint[]; compact?: boolean }) {
	if (!points.length || !points.some((point) => point.suggestions > 0)) {
		return <div className={styles.chartEmpty}><span className="mono">—</span><p>No recovery data for this period.</p><small>Requests will appear here after the matcher serves its first suggestion.</small></div>;
	}

	const width = 720;
	const height = compact ? 150 : 220;
	const inset = { top: 16, right: 8, bottom: 25, left: 8 };
	const innerWidth = width - inset.left - inset.right;
	const innerHeight = height - inset.top - inset.bottom;
	const max = Math.max(1, ...points.map((point) => point.suggestions));
	const x = (index: number) => inset.left + (points.length === 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth);
	const y = (value: number) => inset.top + innerHeight - (value / max) * innerHeight;
	const totalPath = points.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point.suggestions).toFixed(1)}`).join(" ");
	const recoveredPath = points.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point.recovered).toFixed(1)}`).join(" ");
	const areaPath = `${totalPath} L${x(points.length - 1).toFixed(1)},${(inset.top + innerHeight).toFixed(1)} L${x(0).toFixed(1)},${(inset.top + innerHeight).toFixed(1)} Z`;
	const labels = points.length > 4 ? [0, Math.floor((points.length - 1) / 2), points.length - 1] : points.map((_, index) => index);

	return <div className={styles.chartWrap}>
		<div className={styles.chartLegend}><span><i className={styles.legendTotal}/>404 requests</span><span><i className={styles.legendRecovered}/>Recovered</span></div>
		<svg className={styles.chart} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="404 requests and recovered destinations over time" preserveAspectRatio="none">
			<defs><linearGradient id="recovery-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--signal)" stopOpacity=".15"/><stop offset="1" stopColor="var(--signal)" stopOpacity="0"/></linearGradient></defs>
			{[0, .5, 1].map((ratio) => <line key={ratio} x1={inset.left} x2={width - inset.right} y1={inset.top + ratio * innerHeight} y2={inset.top + ratio * innerHeight} className={styles.chartGrid}/>) }
			<path d={areaPath} fill="url(#recovery-area)" />
			<path d={totalPath} className={styles.chartTotal} vectorEffect="non-scaling-stroke" />
			<path d={recoveredPath} className={styles.chartRecovered} vectorEffect="non-scaling-stroke" />
			{labels.map((index) => <text key={index} x={x(index)} y={height - 5} textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"} className={styles.chartLabel}>{shortDate(points[index]?.date)}</text>)}
		</svg>
	</div>;
}

function shortDate(value: string | undefined): string {
	if (!value) return "";
	const date = new Date(value.includes("T") ? value : `${value}T00:00:00Z`);
	return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}
