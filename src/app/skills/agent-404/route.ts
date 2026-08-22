export function GET() {
	return new Response(null, {
		status: 302,
		headers: { Location: "/skills/agent-404/SKILL.md" },
	});
}
