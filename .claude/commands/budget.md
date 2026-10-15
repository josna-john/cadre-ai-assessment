---
description: Show OpenRouter spend and remaining budget for the chatbot key
---
Check the chatbot's OpenRouter budget without printing the key:

```bash
K=$(grep ^OPENROUTER_API_KEY .env.local | cut -d= -f2) && curl -s https://openrouter.ai/api/v1/key -H "Authorization: Bearer $K"
```

Report `limit`, `usage` (USD spent), `limit_remaining` and `expires_at`. Flag it if less than $1 remains. Never echo the key.
