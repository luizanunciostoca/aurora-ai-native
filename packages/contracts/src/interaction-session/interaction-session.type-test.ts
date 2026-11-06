import type { ExecutionId, InteractionSessionId, InteractionTurnId } from '../ids/types.js';
import type { InteractionSession, InteractionTurn } from './types.js';

declare const interactionSessionId: InteractionSessionId;
declare const interactionTurnId: InteractionTurnId;
declare const executionId: ExecutionId;
declare const session: InteractionSession;
declare const turn: InteractionTurn;

const sessionIdIdentity: InteractionSessionId = interactionSessionId;
const turnIdIdentity: InteractionTurnId = interactionTurnId;
const sessionNeverAuthorizes: false = session.authorizesExecution;
const sessionNeverProvesSuccess: false = session.provesExecutionSuccess;
const sessionNeverAuthorizesRetry: false = session.retryAuthorized;
const turnNeverAuthorizes: false = turn.authorizesExecution;
const turnNeverProvesSuccess: false = turn.provesExecutionSuccess;
const turnNeverAuthorizesRetry: false = turn.retryAuthorized;

void sessionIdIdentity;
void turnIdIdentity;
void sessionNeverAuthorizes;
void sessionNeverProvesSuccess;
void sessionNeverAuthorizesRetry;
void turnNeverAuthorizes;
void turnNeverProvesSuccess;
void turnNeverAuthorizesRetry;

// @ts-expect-error Interaction sessions are not execution identities.
const sessionAsExecution: ExecutionId = interactionSessionId;
void sessionAsExecution;

// @ts-expect-error Execution identities are not interaction sessions.
const executionAsSession: InteractionSessionId = executionId;
void executionAsSession;

// @ts-expect-error Session and turn identities are distinct canonical namespaces.
const turnAsSession: InteractionSessionId = interactionTurnId;
void turnAsSession;

// @ts-expect-error A turn cannot claim action authority.
const authoritativeTurn: InteractionTurn = { ...turn, authorizesExecution: true };
void authoritativeTurn;

// @ts-expect-error A session cannot promote a response to verified execution success.
const outcomeSession: InteractionSession = { ...session, provesExecutionSuccess: true };
void outcomeSession;
