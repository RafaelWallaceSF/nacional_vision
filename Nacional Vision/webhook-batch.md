# Nacional Vision — Webhook em lote

## Objetivo
A campanha deve enviar **um único webhook por execução**, contendo todos os destinatários no array `itens`.

Isso substitui o envio antigo de **um POST por vendedor/supervisor**.

## Formato atual adotado

```json
{
  "event": "campaign.batch_dispatch",
  "campanha_id": "20",
  "campanha_nome": "Campanha diária",
  "hora": "08:00",
  "tipo_relatorio": "sem_compras",
  "nome_relatorio": "Sem compras",
  "reference_date": "2026-03-26",
  "total_itens": 2,
  "itens": [
    {
      "nome": "BRUNO VIEIRA",
      "tipo": "vendedor",
      "telefone": "553498241365",
      "tipo_relatorio": "sem_compras",
      "link_pdf": "http://74.1.21.111:4000/api/reports/sem-compras/pdf/sem-compras-2026-03-26-bruno-vieira.pdf?referenceDate=2026-03-26&top=20&vendedor=BRUNO+VIEIRA",
      "hora": "08:00",
      "campanha": "Campanha diária",
      "meta": {
        "memberKey": "BRUNO VIEIRA",
        "filters": {
          "vendedor": "BRUNO VIEIRA",
          "supervisor": "",
          "top": 20
        },
        "referenceDate": "2026-03-26",
        "periodRef": "202603"
      }
    }
  ]
}
```

## Campos principais por item
- `nome` → nome do vendedor ou supervisor
- `tipo` → `vendedor`, `supervisor`, etc.
- `telefone` → destino normalizado
- `tipo_relatorio` → código do relatório
- `link_pdf` → URL pública do PDF
- `hora` → horário da campanha
- `campanha` → nome da campanha

## Regras implementadas
- sempre envia **em lote**, mesmo com 1 item
- `total_itens` informa a quantidade do lote
- os itens são montados antes do POST
- o histórico grava o payload batch enviado

## Origem dos dados
- `campanha_id` → `daily_report_rules.id`
- `campanha_nome` → `daily_report_rules.rule_name`
- `hora` → `daily_report_rules.send_time`
- `tipo_relatorio` → `daily_report_rules.report_type_code`
- `nome_relatorio` → catálogo de relatórios do backend
- `nome` → `member_label` ou `member_key`
- `telefone` → `destination`
- `link_pdf` → rota pública gerada pelo backend

## Observação
Se o receptor precisar de outro nome de campo (`items` em vez de `itens`, por exemplo), a adaptação é simples e pode ser feita no backend.
