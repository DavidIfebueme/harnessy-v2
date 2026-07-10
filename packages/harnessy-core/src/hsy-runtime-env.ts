import { homedir } from "node:os";
import { join } from "node:path";
import process from "node:process";

export const HSY_APP_NAME = "hsy";
export const HSY_APP_TITLE = "Harnessy";
export const HSY_APP_DESCRIPTION = "Harnessy agent-first context engine";
export const HSY_CONFIG_DIR = ".hsy";

/**
 * Configure the canonical Harnessy runtime identity and the legacy Pi host
 * variables consumed by existing ecosystem packages.
 *
 * The aliases identify Harnessy as the host; they do not launch Pi or point at
 * Pi's config. In particular, PI_CODING_AGENT_DIR is always overwritten with
 * Harnessy's agent directory so an inherited shell value cannot leak package
 * state into ~/.pi/agent.
 */
export function configureHsyRuntimeEnv(env: NodeJS.ProcessEnv = process.env, homeDir: string = homedir()): string {
	const agentDir = env.HSY_CODING_AGENT_DIR?.trim() || join(homeDir, HSY_CONFIG_DIR, "agent");

	env.HSY_CODING_AGENT_DIR = agentDir;
	env.HSY_CONFIG_DIR = HSY_CONFIG_DIR;
	env.PI_CODING_AGENT_DIR = agentDir;
	env.PI_CONFIG_DIR = HSY_CONFIG_DIR;
	env.PI_APP_NAME = HSY_APP_NAME;
	env.PI_APP_TITLE = HSY_APP_TITLE;
	env.PI_APP_DESCRIPTION = HSY_APP_DESCRIPTION;
	env.HARNESSY_PI_RUNTIME = "true";

	return agentDir;
}
