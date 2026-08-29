# Estrutura de Arquivos do Sistema Manus AI

Este documento descreve a estrutura de diretórios e arquivos do sistema Manus AI, organizada para otimizar a modularidade, a clareza e a manutenção.

```
system/manus/
├── agent/
│   ├── __init__.py
│   ├── agent_update_plan.py
│   ├── agent_advance_phase.py
│   ├── agent_end_task.py
│   └── agent_schedule_task.py
├── browser/
│   ├── __init__.py
│   ├── browser_navigate.py
│   ├── browser_view.py
│   ├── browser_click.py
│   ├── browser_input.py
│   ├── browser_move_mouse.py
│   ├── browser_press_key.py
│   ├── browser_select_option.py
│   ├── browser_save_image.py
│   ├── browser_scroll_up.py
│   ├── browser_scroll_down.py
│   ├── browser_console_exec.py
│   └── browser_console_view.py
├── file/
│   ├── __init__.py
│   ├── file_read.py
│   ├── file_write_text.py
│   ├── file_append_text.py
│   └── file_replace_text.py
├── info/
│   ├── __init__.py
│   ├── info_search_web.py
│   ├── info_search_image.py
│   └── info_search_api.py
├── media/
│   ├── __init__.py
│   ├── media_generate_image.py
│   └── media_generate_speech.py
├── message/
│   ├── __init__.py
│   ├── message_notify_user.py
│   └── message_ask_user.py
├── service/
│   ├── __init__.py
│   ├── service_expose_port.py
│   ├── service_deploy_frontend.py
│   └── service_deploy_backend.py
├── shell/
│   ├── __init__.py
│   ├── shell_exec.py
│   ├── shell_view.py
│   ├── shell_wait.py
│   ├── shell_input.py
│   └── shell_kill.py
├── slide/
│   ├── __init__.py
│   ├── slide_initialize.py
│   └── slide_present.py
├── system/
│   ├── __init__.py
│   └── system_snip_history.py
├── tools/
│   ├── __init__.py
│   └── tool_registry.py
├── docs/
│   └── documento_estrutura_arquivos_manus.md
├── src/
│   ├── llm/
│   │   ├── __init__.py
│   │   └── gemini_interface.py
│   ├── agent_core/
│   │   ├── __init__.py
│   │   ├── agent_loop.py
│   │   ├── task_manager.py
│   │   └── meta_cognition.py
│   ├── orchestration/
│   │   ├── __init__.py
│   │   ├── tool_orchestrator.py
│   │   └── sandbox_interface.py
│   ├── memory/
│   │   ├── __init__.py
│   │   ├── context_manager.py
│   │   └── long_term_memory.py
│   └── modules/
│       ├── __init__.py
│       ├── data_analysis.py
│       ├── image_generation.py
│       ├── code_generation.py
│       └── web_search.py
├── config/
│   ├── __init__.py
│   └── settings.py
├── logs/
│   ├── __init__.py
│   ├── system.log
│   └── error.log
├── data/
│   ├── __init__.py
│   ├── user_profiles.json
│   └── task_history.db
└── tests/
    └── __init__.py
```
