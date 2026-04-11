import asyncio
import os
import sys

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from main import chat_refine, ChatRequest

async def test():
    req = ChatRequest(
        user_message="test",
        history=[],
        transcript="test",
        current_content="test",
        mode="summary"
    )
    try:
        resp = await chat_refine(req)
        print("SUCCESS:", resp)
    except Exception as e:
        import traceback
        print("FAILURE:")
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test())
