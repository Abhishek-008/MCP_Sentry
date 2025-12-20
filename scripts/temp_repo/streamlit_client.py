"""Streamlit Client for MCP Code Interpreter Server

Minimal interface with just query input and response display.
"""

import asyncio
import base64
import json
from pathlib import Path
from io import BytesIO

import streamlit as st
from PIL import Image

# Import MCP server functions for direct testing
import sys
sys.path.insert(0, str(Path(__file__).parent))

from mcp_server import execute_python_code, get_generated_files, reset_interpreter


# Page configuration
st.set_page_config(
    page_title="Code Interpreter",
    page_icon="🐍",
    layout="centered"
)

# Custom CSS
st.markdown("""
<style>
    .main {
        max-width: 900px;
    }
    .stTextArea textarea {
        font-family: 'Courier New', monospace;
        font-size: 14px;
    }
</style>
""", unsafe_allow_html=True)


def run_async(coro):
    """Helper to run async functions in Streamlit."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def main():
    """Main application."""
    
    st.title("🐍 Code Interpreter")
    
    # Query input
    query = st.text_area(
        "Enter your Python code:",
        height=200,
        placeholder="Example:\nprint('Hello, World!')\n\nimport matplotlib.pyplot as plt\nimport numpy as np\n\nx = np.linspace(0, 10, 100)\nplt.plot(x, np.sin(x))\nplt.title('Sine Wave')\nplt.show()",
        key="code_input"
    )
    
    # Execute button
    if st.button("▶️ Execute", type="primary", use_container_width=True):
        if query.strip():
            with st.spinner("Executing..."):
                try:
                    # Clear old files before execution
                    run_async(reset_interpreter())
                    
                    # Execute the code
                    result = run_async(execute_python_code(query))
                    
                    # Display result
                    st.markdown("### Response")
                    
                    # Check if there's an error in the result
                    if "=== ERROR ===" in result:
                        st.error(result)
                    else:
                        st.success("✅ Execution completed")
                        st.text(result)
                    
                    # Get and display only newly generated image files
                    files_json = run_async(get_generated_files())
                    files_data = json.loads(files_json)
                    
                    # Filter for new image files only (exclude .gitkeep)
                    images = [f for f in files_data.get("files", []) 
                             if f.get("type") == "image" 
                             and f.get("is_new", True)
                             and f.get("filename") != ".gitkeep"]
                    
                    if images:
                        st.markdown("### Generated Images")
                        for file_info in images:
                            if "content_base64" in file_info:
                                img_data = base64.b64decode(file_info["content_base64"])
                                img = Image.open(BytesIO(img_data))
                                st.image(img, caption=file_info['filename'], use_container_width=True)
                    
                except Exception as e:
                    st.error(f"❌ Error: {str(e)}")
        else:
            st.warning("⚠️ Please enter some Python code to execute.")


if __name__ == "__main__":
    main()
