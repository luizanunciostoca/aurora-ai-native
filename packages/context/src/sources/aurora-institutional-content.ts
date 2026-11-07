/**
 * Original PUBLIC institutional data selected under the owner's explicit delegation.
 * This file records content/provenance only: it is not a current memory projection,
 * tenant/session identity, policy snapshot, consent record or runtime activation.
 * Do not automatically stage, validate or promote it into an operational source.
 * Source SHA-256 covers the exact UTF-8 text, without a trailing newline.
 */
export const AURORA_INSTITUTIONAL_CONTENT = Object.freeze({
  sourceReference: 'aurora.public.institutional.introduction',
  memoryKey: 'aurora:institutional:introduction',
  sourceRevision: 'sha256:4ec28cf000232d5ecaac43dd28e0d760b020116b5b014455239ade7c3c3b2280',
  contentSha256: '4ec28cf000232d5ecaac43dd28e0d760b020116b5b014455239ade7c3c3b2280',
  utf8Bytes: 353,
  classification: 'PUBLIC',
  contentKind: 'TEXT',
  text: 'A Aurora Córtex é um projeto de assistente digital da Morro Digital. Seu objetivo é combinar interação por voz, inteligência artificial local e ações governadas no Android. Nesta primeira experiência informacional, as respostas se limitam a este texto institucional. Uma resposta informativa não equivale a uma ação executada no dispositivo.',
  provenanceReference:
    'https://github.com/luizanunciostoca/aurora-ai-native/issues/575#issuecomment-6691169203',
  authorship: 'ASSISTANT_AUTHORED_UNDER_OWNER_DELEGATION',
  useScope: 'LOCAL_INSTITUTIONAL_INFORMATION_ONLY',
  authorizesExecution: false,
  canInvokeTools: false,
} as const);
