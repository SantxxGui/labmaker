/**
 * Teste de ponta a ponta da API — `npm run test:api` (servidor rodando; BASE_URL opcional).
 * Cobre: o Líder cuida de tudo, permissões do aluno, fluxo aluno → reserva, empréstimo, agente,
 * redefinição de senha, limite de tentativas de login e revogação imediata de sessão.
 */
import { BASE, Cliente, SENHA, confere, prepararMaquina, proximoDiaUtil, resumo, unico } from "./_cliente";

async function main() {
  console.log(`LabMaker · teste de API em ${BASE}\n`);
  const lider = await new Cliente("Líder").login(process.env.LIDER_EMAIL ?? "lider@labmaker.dev");
  const anon = new Cliente("anônimo");

  // ── Público x protegido
  confere("health é público", (await anon.get("/api/health")).status === 200);
  confere("openapi.json é público", (await anon.get("/api/openapi.json")).status === 200);
  confere("sem sessão → 401", (await anon.get("/api/equipamentos")).status === 401);
  const h = (await anon.get("/")).headers;
  const ck1 = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: process.env.LIDER_EMAIL ?? "lider@labmaker.dev", senha: SENHA }) });
  const ck2 = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https" }, body: JSON.stringify({ email: process.env.LIDER_EMAIL ?? "lider@labmaker.dev", senha: SENHA }) });
  confere("cookie Secure só em HTTPS (login pela rede em http funciona)", !/;\s*secure/i.test(ck1.headers.get("set-cookie") ?? "") && /;\s*secure/i.test(ck2.headers.get("set-cookie") ?? ""));
  confere("cabeçalhos de segurança", !!h.get("content-security-policy") && h.get("x-frame-options") === "DENY" && h.get("x-content-type-options") === "nosniff");

  // ── O Líder cuida de tudo
  const maq = await prepararMaquina(lider);
  confere("Líder cadastra máquina", !!maq.id, maq.nome);
  const lab = (await lider.get("/api/laboratorios")).json!.laboratorios[0];
  confere("Líder lê a auditoria", (await lider.get("/api/auditoria")).status === 200);
  confere("Líder gerencia usuários", (await lider.get("/api/usuarios")).status === 200);

  // ── Aluno: conta própria e reserva na hora
  const email = `aluno.${unico()}@teste.dev`;
  const aluno = new Cliente("Aluno");
  confere("aluno cria a própria conta", (await aluno.post("/api/auth/cadastro", { nome: "Aluno de Teste", email, senha: "senhaforte1" })).status === 201);
  confere("aluno NÃO cadastra máquina", (await aluno.post("/api/equipamentos", { nome: "x", tipo: "OUTRO", laboratorioId: lab.id, duracaoSlotMinutos: 60 })).status === 403);
  confere("aluno NÃO vê os notebooks", (await aluno.get("/api/dispositivos")).status === 403);
  confere("aluno NÃO lê a auditoria", (await aluno.get("/api/auditoria")).status === 403);
  confere("aluno NÃO lista usuários", (await aluno.get("/api/usuarios")).status === 403);
  const dia = proximoDiaUtil(2);
  const slots = (await aluno.get(`/api/equipamentos/${maq.id}/disponibilidade?data=${dia}`)).json?.slots ?? [];
  const livre = slots.find((s: { disponivel: boolean }) => s.disponivel);
  confere("máquina recém-cadastrada já tem horários", !!livre, `${slots.filter((s: { disponivel: boolean }) => s.disponivel).length} livres em ${dia}`);
  const res = await aluno.post("/api/agendamentos", { equipamentoId: maq.id, inicio: livre.inicio, finalidade: "Teste automatizado" });
  confere("aluno reserva a máquina", res.status === 201);
  confere("mesmo horário de novo → 409", (await aluno.post("/api/agendamentos", { equipamentoId: maq.id, inicio: livre.inicio })).status === 409);
  confere("validação rejeita corpo inválido → 422 com mensagem", (await aluno.post("/api/agendamentos", { finalidade: 123 })).status === 422);

  // ── Notebook manual + empréstimo
  const host = `T-NB-${unico().slice(0, 6).toUpperCase()}`;
  const nb = await lider.post("/api/dispositivos", { hostname: host, tipo: "NOTEBOOK", so: "WINDOWS", fabricante: "Teste", modelo: "T1", numeroSerie: `S-${unico()}` });
  confere("Líder cadastra notebook sem agente", nb.status === 201, host);
  const me = (await aluno.get("/api/auth/me")).json!;
  const alunoId = me.usuario?.id ?? me.id;
  const prazo = new Date(Date.now() + 3 * 3_600_000).toISOString();
  const em = await lider.post("/api/emprestimos", { dispositivoId: nb.json!.dispositivo.id, usuarioId: alunoId, prazoEm: prazo });
  confere("Líder empresta o notebook", em.status === 201);
  confere("mesmo notebook de novo → 409", (await lider.post("/api/emprestimos", { dispositivoId: nb.json!.dispositivo.id, usuarioId: alunoId, prazoEm: prazo })).status === 409);
  confere("aluno vê o notebook que está com ele", ((await aluno.get("/api/emprestimos/meus")).json?.emprestimos ?? []).some((e: { dispositivo: { hostname: string } }) => e.dispositivo.hostname === host));
  confere("Líder registra a devolução", (await lider.post(`/api/emprestimos/${em.json!.emprestimo.id}/devolver`)).status === 200);

  // ── Agente
  const pols = (await lider.get("/api/politicas")).json?.politicas ?? [];
  const cod = await lider.post("/api/dispositivos/inscricao", { politicaId: pols[0]?.id, laboratorioId: null });
  confere("Líder gera código de inscrição", cod.status === 201 || cod.status === 200);
  confere("código de inscrição é curto (6 letras) e vem com o comando de uma linha",
    /^[A-HJ-KM-NP-Z2-9]{6}$/.test(cod.json?.codigo ?? "") && /^powershell -c "irm .+\/i\/[A-Z0-9]{6}\|iex"$/.test(cod.json?.comandos?.windows ?? ""));
  // ── Instalação em um comando: /i/CÓDIGO devolve o script certo para quem pede
  const instalador = async (codigo: string, ua: string, ip = "203.0.113.7") => {
    const r = await fetch(`${BASE}/i/${codigo}`, { headers: { "User-Agent": ua, "X-Forwarded-For": ip } });
    return { status: r.status, texto: await r.text() };
  };
  const ps = await instalador(cod.json!.codigo, "Mozilla/5.0 (Windows NT; Windows NT 10.0; pt-BR) WindowsPowerShell/5.1.26100.1");
  confere("Windows (irm|iex) recebe o script PowerShell com código e opções", ps.status === 200 && ps.texto.includes(`$codigo = '${cod.json!.codigo}'`) && ps.texto.includes("'--permitir-bloqueio'") && ps.texto.includes("'--instalar-servico'"));
  const sh = await instalador(cod.json!.codigo.toLowerCase(), "curl/8.5.0");
  confere("Linux/macOS (curl|sh) recebe o script sh (código em minúsculas também vale)", sh.status === 200 && sh.texto.startsWith("#!/bin/sh") && sh.texto.includes(`CODIGO='${cod.json!.codigo}'`));
  confere("pelo navegador, /i/CÓDIGO explica como usar", (await instalador(cod.json!.codigo, "Mozilla/5.0 Chrome/131")).texto.includes("Win+R"));
  const errado = await instalador("ZZZZZZ", "WindowsPowerShell/5.1", "203.0.113.8");
  confere("código inexistente: o PowerShell mostra o erro em vez de um 404 mudo", errado.status === 200 && errado.texto.includes("invalido ou vencido"));
  // quem tenta adivinhar códigos é barrado depois de 5 erros (por IP)
  for (let i = 0; i < 4; i++) await instalador(`ZZZZZ${"ABCD"[i]}`, "curl/8.5.0", "203.0.113.9");
  await instalador("ZZZZZE", "curl/8.5.0", "203.0.113.9");
  const barrado = await fetch(`${BASE}/api/agente/inscrever`, { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": "203.0.113.9" },
    body: JSON.stringify({ codigo: cod.json!.codigo, hostname: "T-BRUTO", so: "LINUX", versaoSo: "x", numeroSerie: `AG-${unico()}`, agenteVersao: "4.6.0", fabricante: "T", modelo: "T" }) });
  confere("5 códigos errados seguidos → o IP espera 15 min (429), mesmo acertando depois", barrado.status === 429);
  const ag = await anon.post("/api/agente/inscrever", { codigo: cod.json!.codigo, hostname: `T-AG-${unico().slice(0, 6)}`, so: "LINUX", versaoSo: "Linux teste", numeroSerie: `AG-${unico()}`, agenteVersao: "4.6.0", fabricante: "Teste", modelo: "VM" });
  confere("agente se inscreve com o código", ag.status === 201 || ag.status === 200);
  const tk = ag.json!.token as string;
  confere("token do agente tem o prefixo lmk_", tk.startsWith("lmk_"));
  const ck = await anon.req("POST", "/api/agente/checkin", { agenteVersao: "4.6.0", telemetria: { cpu: 12, memoria: 40 }, seguranca: {}, eventos: [], resultados: [] }, { Authorization: `Bearer ${tk}` });
  confere("check-in do agente", ck.status === 200 && typeof ck.json?.intervaloSeg === "number");
  // ── Suporte remoto: pedido → usuário autoriza → quadros → Líder vê → Líder encerra
  const agenteH = { Authorization: `Bearer ${tk}` };
  const agId = ag.json!.dispositivoId as string;
  const pedido = await lider.post(`/api/dispositivos/${agId}/acoes`, { tipo: "SESSAO_REMOTA", justificativa: "Teste automatizado da tela" });
  confere("Líder pede acesso à tela", pedido.status === 201, pedido.json?.error);
  const entregue = await anon.req("POST", "/api/agente/checkin", { agenteVersao: "4.7.0", telemetria: {}, seguranca: {}, eventos: [], resultados: [] }, agenteH);
  const acaoTela = (entregue.json?.acoes ?? []).find((x: { tipo: string }) => x.tipo === "SESSAO_REMOTA");
  confere("agente recebe o pedido no check-in", !!acaoTela);
  const JPEG = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";
  const q1 = await anon.req("POST", "/api/agente/tela", { acaoId: acaoTela.id, imagem: JPEG, tipo: "image/jpeg" }, agenteH);
  confere("agente transmite depois de autorizado", q1.status === 200 && q1.json?.continuar === true);
  const est = await lider.get(`/api/dispositivos/${agId}/tela`);
  confere("Líder vê a sessão ao vivo", est.json?.sessao?.ativa === true && est.json?.sessao?.sinal === "ao-vivo");
  const img = await fetch(`${BASE}/api/dispositivos/${agId}/tela/imagem`, { headers: { Cookie: lider.cookie } });
  confere("Líder recebe a imagem da tela", img.status === 200 && img.headers.get("content-type") === "image/jpeg");
  confere("aluno NÃO vê a tela de ninguém", (await aluno.get(`/api/dispositivos/${agId}/tela/imagem`)).status === 403);
  confere("Líder encerra a sessão", (await lider.post(`/api/dispositivos/${agId}/tela/encerrar`)).status === 200);
  const q2 = await anon.req("POST", "/api/agente/tela", { acaoId: acaoTela.id, imagem: JPEG, tipo: "image/jpeg" }, agenteH);
  confere("depois de encerrada, o agente para", q2.json?.continuar === false);
  confere("imagem some ao encerrar", (await fetch(`${BASE}/api/dispositivos/${agId}/tela/imagem`, { headers: { Cookie: lider.cookie } })).status === 404);
  confere("quadro com pedido inventado → recusado", (await anon.req("POST", "/api/agente/tela", { acaoId: "inventado", imagem: JPEG }, agenteH)).json?.continuar === false);

  // ── Tela ao vivo por SSE: o primeiro evento já traz o estado da sessão
  const sse = new AbortController();
  const fluxo = await fetch(`${BASE}/api/dispositivos/${agId}/tela/eventos`, { headers: { Cookie: lider.cookie }, signal: sse.signal });
  const primeiro = new TextDecoder().decode((await fluxo.body!.getReader().read()).value);
  sse.abort();
  confere("SSE da tela responde text/event-stream com o estado", fluxo.headers.get("content-type")?.startsWith("text/event-stream") === true && primeiro.includes("event: estado"));

  // ── Atendimento: aluno pede ajuda → Líder conversa → vê a tela pré-autorizada → encerra
  const checkin = (resultados: unknown[] = []) => anon.req("POST", "/api/agente/checkin", { agenteVersao: "4.8.0", telemetria: {}, seguranca: {}, eventos: [], resultados }, agenteH);
  confere("aluno NÃO vê a fila de atendimento", (await aluno.get("/api/chamados")).status === 403);
  const ch = await anon.req("POST", "/api/agente/chamados", { descricao: "O Inkscape não abre", nome: "aluno.teste", autorizaTela: true }, agenteH);
  confere("aluno pede ajuda pelo agente", ch.status === 201, `#${ch.json?.chamado?.numero}`);
  const chId = ch.json!.chamado.id as string;
  confere("segundo pedido no mesmo aparelho reaproveita o aberto", (await anon.req("POST", "/api/agente/chamados", { descricao: "De novo" }, agenteH)).json?.jaExistia === true);
  confere("selo do menu conta o pedido", ((await lider.get("/api/chamados/contagem")).json?.abertos ?? 0) >= 1);
  confere("pedido aparece na fila do Líder", ((await lider.get("/api/chamados")).json?.chamados ?? []).some((c: { id: string }) => c.id === chId));
  const cka1 = await checkin();
  confere("check-in informa o chamado e acelera (3 s)", cka1.json?.chamado?.id === chId && cka1.json?.intervaloSeg === 3);
  confere("Líder responde no chat", (await lider.post(`/api/chamados/${chId}/mensagens`, { texto: "Oi! Já vou ver sua tela." })).status === 201);
  confere("responder já coloca em atendimento", (await lider.get(`/api/chamados/${chId}`)).json?.chamado?.status === "EM_ATENDIMENTO");
  const cka2 = await checkin();
  confere("mensagem do Líder chega no aparelho", (cka2.json?.mensagens ?? []).some((m: { texto: string }) => m.texto.includes("Já vou ver")));
  confere("mensagem não é entregue duas vezes", !((await checkin()).json?.mensagens ?? []).some((m: { texto: string }) => m.texto.includes("Já vou ver")));
  confere("aluno responde pelo agente", (await anon.req("POST", "/api/agente/chamados/mensagem", { texto: "Obrigado!", nome: "aluno.teste" }, agenteH)).status === 201);
  confere("Líder vê a resposta", ((await lider.get(`/api/chamados/${chId}`)).json?.chamado?.mensagens ?? []).some((m: { autor: string; texto: string }) => m.autor === "USUARIO" && m.texto === "Obrigado!"));
  confere("Líder pede a tela pelo chamado", (await lider.post(`/api/chamados/${chId}/tela`)).status === 201);
  const pre = ((await checkin()).json?.acoes ?? []).find((x: { tipo: string }) => x.tipo === "SESSAO_REMOTA");
  confere("pedido de tela chega pré-autorizado (sem nova pergunta)", !!pre?.parametro?.endsWith(":pre-autorizado"), pre?.parametro);
  confere("tela pré-autorizada transmite", (await anon.req("POST", "/api/agente/tela", { acaoId: pre.id, imagem: JPEG, tipo: "image/jpeg" }, agenteH)).json?.continuar === true);
  confere("tela sem mudança: só avisa (mesmo: true)", (await anon.req("POST", "/api/agente/tela", { acaoId: pre.id, mesmo: true }, agenteH)).json?.continuar === true);
  await lider.post(`/api/dispositivos/${agId}/tela/encerrar`);
  confere("Líder encerra o atendimento", (await lider.post(`/api/chamados/${chId}/resolver`)).status === 200);
  const cka3 = await checkin();
  confere("aparelho vê o atendimento encerrado e volta a 15 s", !cka3.json?.chamado && cka3.json?.intervaloSeg === 15);
  const ini = await lider.post(`/api/dispositivos/${agId}/atendimento`);
  confere("Líder inicia uma conversa pelo aparelho", ini.status === 201 && ini.json?.chamado?.status === "EM_ATENDIMENTO");
  await lider.post(`/api/chamados/${ini.json!.chamado.id}/resolver`);

  // ── Automação: lembrete de devolução 15 min antes (o check-in é o relógio)
  const cka4 = (r: { json?: { devolucao?: { tocando?: boolean; alarmeEm?: string } } | null }) => r.json?.devolucao?.tocando === false && !!r.json?.devolucao?.alarmeEm;
  const empAg = await lider.post("/api/emprestimos", { dispositivoId: agId, usuarioId: alunoId, prazoEm: new Date(Date.now() + 20 * 60_000).toISOString() });
  confere("Líder empresta o notebook com agente", empAg.status === 201, empAg.json?.error);
  confere("antes dos 15 min, nenhum lembrete", !((await checkin()).json?.acoes ?? []).some((x: { parametro?: string }) => x.parametro?.startsWith("auto:lembrete")));
  // simula a passagem do tempo: o prazo passa a ser daqui a 10 min
  await import("dotenv/config");
  const { prisma } = await import("../lib/prisma");
  await prisma.emprestimo.update({ where: { id: empAg.json!.emprestimo.id }, data: { prazoEm: new Date(Date.now() + 10 * 60_000) } });
  const lembrete = ((await checkin()).json?.acoes ?? []).find((x: { parametro?: string }) => x.parametro?.startsWith("auto:lembrete"));
  confere("a 10 min do prazo, o aparelho recebe o lembrete", lembrete?.tipo === "ALERTA", lembrete?.titulo);
  confere("o lembrete não se repete", !((await checkin([{ id: lembrete.id, status: "EXECUTADA", motivo: "Lido" }])).json?.acoes ?? []).some((x: { parametro?: string }) => x.parametro?.startsWith("auto:lembrete")));
  const duplicada = await prisma.acaoDispositivo.create({ data: { dispositivoId: agId, tipo: "ALERTA", parametro: lembrete.parametro, titulo: "Duplicado", mensagem: "x", prioridade: "AVISO" } }).then(() => "criou", (e: { code?: string }) => e.code);
  confere("banco recusa automação duplicada (check-in x agendador)", duplicada === "P2002", String(duplicada));
  confere("check-in avisa o prazo da devolução (ainda sem tocar)", cka4(await checkin()));
  // prazo 10:00 → apita às 10:01: o prazo vira "61 s atrás"
  await prisma.emprestimo.update({ where: { id: empAg.json!.emprestimo.id }, data: { retiradoEm: new Date(Date.now() - 30 * 60_000), prazoEm: new Date(Date.now() - 61_000) } });
  const tocando = await checkin();
  confere("1 min depois do prazo o alarme toca e o check-in acelera (5 s)", tocando.json?.devolucao?.tocando === true && tocando.json?.intervaloSeg === 5);
  confere("aparelho emprestado NÃO pode ser removido", (await lider.req("DELETE", `/api/dispositivos/${agId}`, { confirmacao: (await lider.get(`/api/dispositivos/${agId}`)).json?.dispositivo?.hostname })).status === 422);
  await lider.post(`/api/emprestimos/${empAg.json!.emprestimo.id}/devolver`);
  confere("devolução registrada desliga o alarme", !(await checkin()).json?.devolucao);
  await prisma.$disconnect();


  // ── Sistema: diagnóstico, endereços, teste de fechamento, push
  const tv = await lider.get("/api/tv");
  confere("modo TV responde o estado do espaço", tv.status === 200 && typeof tv.json?.resumo?.maquinas === "number" && Array.isArray(tv.json?.proximas));
  confere("modo TV não mostra e-mail nenhum", !JSON.stringify(tv.json).includes("@"));
  confere("aluno NÃO abre o modo TV", (await aluno.get("/api/tv")).status === 403);
  const diag = await lider.get("/api/sistema/diagnostico");
  confere("diagnóstico da pré-apresentação", diag.status === 200 && diag.json?.banco?.ok === true && Array.isArray(diag.json?.agentes));
  confere("aluno NÃO abre o diagnóstico", (await aluno.get("/api/sistema/diagnostico")).status === 403);
  confere("endereços da rede para o QR", Array.isArray((await lider.get("/api/sistema/enderecos")).json?.enderecos));
  confere("teste de fechamento responde os aparelhos", Array.isArray((await lider.post("/api/sistema/fechamento", { acao: "fechar" })).json?.aparelhos));
  confere("teste de abertura desfaz", Array.isArray((await lider.post("/api/sistema/fechamento", { acao: "abrir" })).json?.aparelhos));
  confere("ação de fechamento inválida → 422", (await lider.post("/api/sistema/fechamento", { acao: "explodir" })).status === 422);
  const chave = (await anon.get("/api/agente/push")).json?.chavePublica as string | undefined;
  confere("chave pública VAPID para o push", typeof chave === "string" && chave.length > 60);
  const inscricao = { endpoint: "https://push.exemplo.invalid/abc", keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } };
  confere("aparelho salva a inscrição push", (await anon.req("POST", "/api/agente/push", { inscricao }, agenteH)).status === 200);
  confere("aparelho apaga a inscrição push", (await anon.req("POST", "/api/agente/push", { inscricao: null }, agenteH)).status === 200);

  // ── Celular pelo navegador (/agente): inscreve como SMARTPHONE e recebe avisos
  confere("página /agente é pública", (await anon.get("/agente")).status === 200);
  const codCel = await lider.post("/api/dispositivos/inscricao", { politicaId: pols[0]?.id });
  const cel = await anon.post("/api/agente/inscrever", { codigo: codCel.json!.codigo, hostname: `CEL-T${unico().slice(0, 5).toUpperCase()}`, so: "ANDROID", tipo: "SMARTPHONE", versaoSo: "Android 14", fabricante: "Samsung", modelo: "SM-A155F", numeroSerie: `WEB-${unico()}`, agenteVersao: "web-1.0", armazenamentoGb: 0 });
  confere("celular se inscreve pelo navegador", cel.status === 201);
  const celLista = ((await lider.get("/api/dispositivos")).json?.dispositivos ?? []).find((x: { id: string }) => x.id === cel.json?.dispositivoId);
  confere("celular aparece como Celular · Android", celLista?.tipo === "SMARTPHONE" && celLista?.so === "ANDROID");
  const tkCel = cel.json!.token as string;
  const chCel = await anon.req("POST", "/api/agente/chamados", { descricao: "Preciso de ajuda", nome: "João" }, { Authorization: `Bearer ${tkCel}` });
  confere("celular pede ajuda", chCel.status === 201);
  confere("celular não compartilha tela: pedido de tela → 422", (await lider.post(`/api/chamados/${chCel.json!.chamado.id}/tela`)).status === 422);
  confere("celular cancela o próprio pedido", (await anon.req("POST", "/api/agente/chamados/cancelar", {}, { Authorization: `Bearer ${tkCel}` })).status === 200);

  confere("token falso → 401", (await anon.req("POST", "/api/agente/checkin", {}, { Authorization: "Bearer lmk_falso" })).status === 401);
  confere("código falso → 401", (await anon.post("/api/agente/inscrever", { codigo: "x".repeat(30), hostname: "a1", so: "LINUX", versaoSo: "x", numeroSerie: "1", agenteVersao: "1" })).status === 401);

  // ── Redefinição de senha: o Líder gera uma temporária; a sessão antiga cai, a senha nova entra
  confere("aluno logado antes da redefinição", (await aluno.get("/api/auth/me")).status === 200);
  const rs = await lider.post(`/api/usuarios/${alunoId}/senha`);
  confere("Líder redefine a senha do aluno", rs.status === 200 && /^[a-z2-9]{3}-[a-z2-9]{3}-[a-z2-9]{3}$/.test(rs.json?.senhaTemporaria ?? ""), rs.json?.senhaTemporaria);
  confere("sessão antiga do aluno cai na hora", (await aluno.get("/api/agendamentos")).status === 401);
  confere("senha antiga não entra mais", (await new Cliente("x").post("/api/auth/login", { email, senha: "senhaforte1" })).status === 401);
  await aluno.login(email, rs.json!.senhaTemporaria);
  confere("aluno entra com a senha temporária", (await aluno.get("/api/auth/me")).status === 200);

  // ── Meu perfil: nome e senha da própria conta
  const senhaTemp = rs.json!.senhaTemporaria as string;
  confere("aluno vê o próprio perfil", (await aluno.get("/api/auth/perfil")).json?.usuario?.email === email);
  confere("aluno muda o próprio nome", (await aluno.patch("/api/auth/perfil", { nome: "Aluno Renomeado" })).status === 200);
  confere("nome novo aparece sem novo login", (await aluno.get("/api/auth/me")).json?.usuario?.nome === "Aluno Renomeado");
  confere("nome curto demais → 422", (await aluno.patch("/api/auth/perfil", { nome: "ab" })).status === 422);
  const outroAparelho = await new Cliente("Aluno no celular").login(email, senhaTemp);
  confere("senha atual errada → 400", (await aluno.post("/api/auth/senha", { senhaAtual: "errada", novaSenha: "novasenha99" })).status === 400);
  confere("nova senha igual à atual → 422", (await aluno.post("/api/auth/senha", { senhaAtual: senhaTemp, novaSenha: senhaTemp })).status === 422);
  confere("aluno troca a própria senha", (await aluno.post("/api/auth/senha", { senhaAtual: senhaTemp, novaSenha: "novasenha99" })).status === 200);
  confere("quem trocou continua conectado", (await aluno.get("/api/auth/me")).status === 200);
  confere("o outro aparelho é desconectado", (await outroAparelho.get("/api/auth/me")).status === 401);
  confere("a senha nova entra", (await new Cliente("x").post("/api/auth/login", { email, senha: "novasenha99" })).status === 200);
  confere("Líder corrige o nome do aluno", (await lider.patch(`/api/usuarios/${alunoId}`, { nome: "Aluno Corrigido" })).status === 200);
  confere("corrigir o nome não desconecta o aluno", (await aluno.get("/api/auth/me")).json?.usuario?.nome === "Aluno Corrigido");
  confere("aluno NÃO edita a conta de ninguém", (await aluno.patch(`/api/usuarios/${alunoId}`, { nome: "Hacker" })).status === 403);
  const liderId = (await lider.get("/api/auth/me")).json?.usuario?.id;
  confere("Líder muda o próprio nome só pelo Meu perfil", (await lider.patch(`/api/usuarios/${liderId}`, { nome: "Outro" })).status === 422);

  // ── Revogação de sessão: o Líder bloqueia o aluno → a sessão aberta morre na hora
  confere("Líder bloqueia o aluno", (await lider.patch(`/api/usuarios/${alunoId}`, { ativo: false })).status === 200);
  confere("sessão do aluno revogada imediatamente", (await aluno.get("/api/agendamentos")).status === 401);

  // ── Força bruta: 5 falhas → 429 (e-mail novo para não travar ninguém)
  const alvo = `forca.${unico()}@teste.dev`;
  await new Cliente("x").post("/api/auth/cadastro", { nome: "Alvo do teste", email: alvo, senha: SENHA });
  const atacante = new Cliente("atacante");
  const codigos: number[] = [];
  for (let i = 0; i < 6; i++) codigos.push((await atacante.post("/api/auth/login", { email: alvo, senha: "errada" + i })).status);
  confere("5 senhas erradas → 6ª tentativa recebe 429", codigos.slice(0, 5).every((c) => c === 401) && codigos[5] === 429, codigos.join(" "));
  confere("bloqueio vale mesmo com a senha certa", (await atacante.post("/api/auth/login", { email: alvo, senha: SENHA })).status === 429);

  // ── Exportação
  const csv = await fetch(`${BASE}/api/auditoria/exportar`, { headers: { Cookie: lider.cookie } });
  confere("auditoria exporta CSV", csv.status === 200 && (csv.headers.get("content-type") ?? "").includes("text/csv"));


  // ── Remover aparelho: some da lista, o token do agente deixa de valer, o nome fica livre
  const nomeAg = (await lider.get(`/api/dispositivos/${agId}`)).json?.dispositivo?.hostname as string;
  const emailOutro = `outro.${unico()}@teste.dev`;
  await new Cliente("x").post("/api/auth/cadastro", { nome: "Outro aluno", email: emailOutro, senha: SENHA });
  const outroAluno = new Cliente("outro");
  await outroAluno.post("/api/auth/login", { email: emailOutro, senha: SENHA });
  confere("aluno NÃO remove aparelho", (await outroAluno.req("DELETE", `/api/dispositivos/${agId}`, { confirmacao: nomeAg })).status === 403);
  confere("nome errado na confirmação → 422", (await lider.req("DELETE", `/api/dispositivos/${agId}`, { confirmacao: "OUTRO" })).status === 422);
  confere("Líder remove o aparelho", (await lider.req("DELETE", `/api/dispositivos/${agId}`, { confirmacao: nomeAg })).status === 200);
  confere("aparelho removido some do detalhe e da lista", (await lider.get(`/api/dispositivos/${agId}`)).status === 404
    && !((await lider.get("/api/dispositivos")).json?.dispositivos ?? []).some((x: { id: string }) => x.id === agId));
  confere("o agente do aparelho removido é desconectado (401)", (await checkin()).status === 401);
  confere("remoção fica na auditoria", ((await lider.get("/api/auditoria?entidade=dispositivo")).json?.registros ?? [])
    .some((r: { acao: string }) => r.acao === "dispositivo.removido"));
  resumo();
}

main().catch((e) => { console.error("✖", e.message); process.exit(1); });
