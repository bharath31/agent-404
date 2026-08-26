import { ArrowRightIcon, CheckIcon } from "./icons";
import styles from "./dashboard.module.css";

interface RecoveryTraceProps {
	request: string | null;
	match: string | null;
	hasProtocolEvidence: boolean;
	destination: string | null;
}

export function RecoveryTrace({ request, match, hasProtocolEvidence, destination }: RecoveryTraceProps) {
	const stages = [
		{ key: "request", label: "404 request", value: request ?? "Waiting for a request", done: Boolean(request) },
		{ key: "matcher", label: "matcher", value: match ?? "No candidate yet", done: Boolean(match) },
		{ key: "protocol", label: "Link / JSON-LD", value: hasProtocolEvidence ? "Recovery hints emitted" : "Evidence not detected", done: hasProtocolEvidence },
		{ key: "destination", label: "destination", value: destination ?? "Not followed yet", done: Boolean(destination) },
	];
	const completed = stages.filter((stage) => stage.done).length;

	return <div className={styles.trace} data-complete={completed}>
		<div className={styles.traceRail} aria-hidden="true"><span style={{ height: `${Math.max(0, ((completed - 1) / 3) * 100)}%` }} /><i /></div>
		{stages.map((stage, index) => <div className={styles.traceStage} key={stage.key}>
			<div className={`${styles.traceNode} ${stage.done ? styles.traceNodeDone : ""}`}>{stage.done ? <CheckIcon size={12} /> : <span>{index + 1}</span>}</div>
			<div><p>{stage.label}</p><code title={stage.value}>{stage.value}</code></div>
			{index < stages.length - 1 ? <ArrowRightIcon className={styles.traceArrow} size={14} /> : null}
		</div>)}
	</div>;
}
