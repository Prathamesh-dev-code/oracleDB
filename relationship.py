from flask import Flask, render_template, request, redirect, url_for, session, jsonify
import cx_Oracle
import openai
import pandas as pd
import re
from Crypto.Cipher import AES
from Crypto.Util.Padding import unpad
import base64
import logging

# Configure logging
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.secret_key = 'your_secure_secret_key'

# OpenAI API Key
openai.api_key = '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'

### Decrypt App Key Function ###
def decrypt_app_key(encrypted_key, decryption_key):
    try:
        logger.debug("Starting app key decryption")
        
        if len(decryption_key) not in [16, 24, 32]:
            raise ValueError("Incorrect AES key length")
        
        encrypted_key_bytes = base64.b64decode(encrypted_key)
        cipher = AES.new(decryption_key, AES.MODE_ECB)
        decrypted_data = unpad(cipher.decrypt(encrypted_key_bytes), AES.block_size)
        decrypted_data_str = decrypted_data.decode('utf-8')
        logger.debug(f"Decrypted Data (raw): {decrypted_data_str}")

        config_data = parse_decrypted_data(decrypted_data_str)
        
        if config_data:
            logger.debug(f"Decrypted config data: {config_data}")
        else:
            logger.error("Failed to parse decrypted data")

        # Store the accessible tables in the session
        session['allowed_tables'] = config_data.get('tables', [])
        
        return config_data

    except Exception as e:
        logger.error(f"Decryption error: {e}")
        return None


def parse_decrypted_data(data_str):
    # Use regular expressions to extract key-value pairs
    pattern = re.compile(r'(\w+)=["\']([^"\']*)["\']')
    matches = pattern.findall(data_str)

    # Convert matches to dictionary
    config_dict = {key: value for key, value in matches}

    # Extract and parse the tables list
    tables_pattern = re.compile(r'tables=\[(.*?)\]')
    tables_match = tables_pattern.search(data_str)
    if tables_match:
        tables_str = tables_match.group(1)
        tables_list = [table.strip().strip('"').strip("'") for table in tables_str.split(',')]
        config_dict['tables'] = tables_list

    return config_dict

def get_schema_info():
    try:
        connection = cx_Oracle.connect(user=session['username'], password=session['password'], dsn=session['dsn'])
        cursor = connection.cursor()

        allowed_tables = session.get('tables', [])

        schema_query = """
        SELECT table_name, column_name, data_type
        FROM all_tab_columns
        WHERE owner = USER
        """ 
        if allowed_tables and allowed_tables != ['all']:
            tables_str = ", ".join([f"'{table.upper()}'" for table in allowed_tables])
            schema_query += f" AND table_name IN ({tables_str})"
        schema_query += " ORDER BY table_name, column_name"

        cursor.execute(schema_query)
        schema_info = cursor.fetchall()

        cursor.close()
        connection.close()

        schema_dict = {}
        for table, column, datatype in schema_info:
            if table not in schema_dict:
                schema_dict[table] = []
            schema_dict[table].append({'column': column, 'datatype': datatype})
        
        return schema_dict

    except cx_Oracle.Error as error:
        logger.error(f"Error fetching schema information: {error}")
        return {}

# Defined the Relationship between the tables
def get_foreign_key_relationships(table_name):
    try:
        connection = cx_Oracle.connect(user=session['username'], password=session['password'], dsn=session['dsn'])
        cursor = connection.cursor()

        query = f"""
        SELECT 
            cons.constraint_type AS "Type",
            ref_cons.table_name AS "Referenced Table",
            ref_cols.column_name AS "Referenced Column"
        FROM 
            user_constraints cons
        JOIN 
            user_cons_columns cols 
            ON cons.constraint_name = cols.constraint_name
        LEFT JOIN 
            user_constraints ref_cons 
            ON cons.r_constraint_name = ref_cons.constraint_name
        LEFT JOIN 
            user_cons_columns ref_cols 
            ON ref_cons.constraint_name = ref_cols.constraint_name
        WHERE 
            cons.table_name = :table_name
            AND cons.constraint_type IN('R','P');
        """
        cursor.execute(query, table_name=table_name.upper())
        relationships = cursor.fetchall()

        cursor.close()
        connection.close()

        foreign_key_relationships = []
        for relationship in relationships:
            constraint_type, referenced_table, referenced_column = relationship
            foreign_key_relationships.append({
                'Type': constraint_type,
                'Referenced Table': referenced_table,
                'Referenced Column': referenced_column
            })

        return foreign_key_relationships

    except cx_Oracle.Error as error:
        logger.error(f"Error fetching foreign key relationships: {error}")
        return []

### Updated NLP to SQL Function ###
def translate_nl_to_sql(nl_query):
    schema_info = get_schema_info()

    # Extract table names involved in the natural language query
    queried_tables = extract_tables_from_query(nl_query, schema_info)
    
    # Initialize an empty dictionary to store foreign key relationships for each table
    fk_relationships = {}
    
    # Loop through the queried tables and get their foreign key relationships
    for table in queried_tables:
        fk_relationships[table] = get_foreign_key_relationships(table)
    
    # Generate SQL query based on natural language query and foreign key relationships
    schema_prompt = "Here is the schema information with datatypes and foreign key relationships:\n"
    for table, columns in schema_info.items():
        column_details = [f"{col['column']} ({col['datatype']})" for col in columns]
        schema_prompt += f"Table {table}: columns: {', '.join(column_details)}\n"
        if table in fk_relationships and fk_relationships[table]:
            fk_details = ', '.join([f"{rel['Referenced Table']}({rel['Referenced Column']})" for rel in fk_relationships[table]])
            schema_prompt += f"Foreign Key Relationships for {table}: {fk_details}\n"


    semantic_prompt = """
    You are an Oracle SQL expert with deep knowledge of database schemas, datatypes, and natural language queries. Your job is to turn a user’s natural language request into an accurate and optimized Oracle SQL query.
    Additionally, perform data analysis, create visualizations when needed, and handle special cases. Follow the guidelines below:

    ### SQL Query Generation Guidelines:
    - Map natural language terms to table names, column names, and data in the database based on the schema.
    - Use Oracle-specific SQL syntax (e.g., TO_DATE, SYSDATE for date functions).
    - Write queries adhering to Oracle standards including date formats like 'YYYY-MM-DD'.
    - Handle multiple conditions, join tables, and perform aggregations like COUNT, SUM, etc.
    - Ensure case-insensitive text comparisons using UPPER or LOWER functions.
    - Limit and paginate results with ROWNUM when appropriate.
    - Provide clear explanations of what the generated SQL query does.
    - Always use the ROWNUM function instead of the FETCH FIRST n ROWS ONLY function

    ### Conversational Chat Handling:
    - Respond to conversational messages with relevant and informative answers, guiding the user to formulating useful queries.
    - If the user's message does not contain a SQL-related request, engage them in a helpful conversation, answering general questions or providing clarification about database-related topics.
    - Provide a natural, engaging flow to the conversation while maintaining professionalism and accuracy in SQL-related queries.

    ### Case-Insensitive Text Matching:
    - If the user inputs a value in mixed case, lowercase, or uppercase, handle case insensitivity by converting both the input and the database column values to the same case (either `UPPER` or `LOWER`).
    - Use Oracle's `UPPER()` or `LOWER()` functions to ensure that the comparison is case-insensitive.
    - Access Control: Deny access if the user attempts to query restricted tables. When the query involves inaccessible tables, provide suggestions to guide them towards more appropriate or accessible alternatives for better understanding.

    ### Table Join Based on Foreign Key References:
    - When performing a JOIN operation, ensure that tables are only joined using columns that have a defined relationship, such as a foreign key constraint. Check for foreign key references between the tables and join based on these columns.
    - If no foreign key relationship exists, suggest alternative approaches or mention that the tables cannot be joined directly.

    ### Conservative Response Approach:
    - Always validate the user’s input to ensure no unintended actions or security risks. Provide responses that are cautious and informative.

    ### Previous Response Handling:
    - Retain and retrieve the last response in cases where the user needs a follow-up or requests further clarification. Always offer the option to display the last SQL query or explanation if the user wants to refer back.

    If the user has no SQL-related query but wants to chat, respond appropriately, providing help where needed.

    Based on the schema information provided, translate the natural language query:
    """

    full_prompt = f"{schema_prompt}\n\n{semantic_prompt}\n\nNatural Language Query: \"{nl_query}\"\n\nSQL Query:"

    # OpenAI API call
    response = openai.ChatCompletion.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are an advanced Oracle SQL AI chatbot, designed specifically to translate natural language queries into precise and optimized Oracle SQL statements. Your role is to leverage your knowledge of Oracle SQL syntax, database schemas, and data types to generate accurate queries. Additionally, you perform complex data analysis, mathematical calculations, and provide insightful responses based on query results from relevant columns."},
            {"role": "user", "content": full_prompt}
        ],
        max_tokens=1500,
        temperature=0.2 
    )

    sql_response = response['choices'][0]['message']['content'].strip()

    # Parse the SQL query and explanation
    sql_query = None
    explanation = None
    if '```sql' in sql_response:
        parts = sql_response.split('```sql')
        if len(parts) > 1:
            sql_query = parts[1].split('```')[0].strip()
            explanation_section = parts[1].split('```')[1:]
            explanation = " ".join(explanation_section).strip() if explanation_section else ''
    else:
        sql_query = sql_response

    return sql_query, explanation


## SQL Query Execution ###
def execute_sql_query(sql_query):
    try:
        connection = cx_Oracle.connect(user=session['username'], password=session['password'], dsn=session['dsn'])
        cursor = connection.cursor()

        sql_query = sanitize_sql_query(sql_query)

        print("Executing SQL Query:", sql_query)

        cursor.execute(sql_query)
        columns = [col[0] for col in cursor.description]
        rows = cursor.fetchall()
        cursor.close()
        connection.close()

        df = pd.DataFrame(rows, columns=columns)
        return df, None

    except cx_Oracle.Error as error:
        print("Oh no! Something went wrong while executing the SQL query:", error)
        return None, "It seems like there was a hiccup in executing your query. Would you like to try again?"

### SQL Query Sanitization ###
def sanitize_sql_query(sql_query):
    sql_query = re.sub(r'--.*', '', sql_query)
    sql_query = sql_query.strip()
    if sql_query.endswith(';'):
        sql_query = sql_query[:-1]
    
    print("Sanitized SQL Query:", sql_query)
    return sql_query

def generate_summary(df, user_query):
    if df.empty:
        return "Oops! It looks like I couldn't find any results for that query. Want to try asking something else?"

    # Convert the DataFrame to a more readable string for GPT
    df_str = df.to_string(index=False)

    # Use GPT to generate a summary of the query results
    summary_prompt = f"""
    You are a data expert. Please generate a friendly summary in 5 lines based on this result and the original query, keeping a conversational tone.

    Original Query: {user_query}

    Query Results:
    {df_str}

    Summary:
    """

    response = openai.ChatCompletion.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are an expert at analyzing and summarizing results."},
            {"role": "user", "content": summary_prompt}
        ],
        max_tokens=250,
        temperature=0.2
    )

    summary = response['choices'][0]['message']['content'].strip()

    return summary



### Web Routes ###
@app.route('/', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        app_key = request.form['app_key']
        decryption_key = b'your_decryption_key_here'  # Use the correct key here
        
        logger.debug("Received app key for login")
        
        config = decrypt_app_key(app_key, decryption_key)
        
        if config:
            username = config.get('username')
            password = config.get('password')
            host = config.get('host')
            port = config.get('port')
            service_name = config.get('service_name')
            tables = config.get('tables', [])
            
            dsn_tns = cx_Oracle.makedsn(host, port, service_name=service_name)
            logger.debug(f"DSN created: {dsn_tns}")

            try:
                connection = cx_Oracle.connect(user=username, password=password, dsn=dsn_tns)
                logger.debug("Successfully connected to Oracle DB")
                connection.close()

                session['username'] = username
                session['password'] = password
                session['dsn'] = dsn_tns
                session['tables'] = tables
                session['chat_log'] = []  # Initialize chat log in session
                
                return redirect(url_for('chat'))

            except cx_Oracle.Error as error:
                logger.error(f"Database connection error: {error}")
                return render_template('login.html', error=str(error))
        
        logger.error("Invalid app key or decryption failed")
        return render_template('login.html', error="Invalid app key")
    
    return render_template('login.html')

### Extract Tables from the Natural Language Query ###
def extract_tables_from_query(nl_query, schema_info):
    """
    Extract table names from the natural language query based on schema information.
    """
    # Extract possible table names from the schema information
    table_names = schema_info.keys()
    # Check if any of the table names are present in the user's query
    queried_tables = [table for table in table_names if table.lower() in nl_query.lower()]
    return queried_tables

@app.route('/get_allowed_tables', methods=['GET'])
def get_allowed_tables():
    allowed_tables = session.get('allowed_tables', [])
    return jsonify(allowed_tables)

@app.route('/chat', methods=['GET', 'POST'])
def chat():
    if 'username' not in session:
        return redirect(url_for('login'))

    if request.method == 'POST':
        user_query = request.form['user_query']
        
        # Translate natural language to SQL
        sql_query, explanation = translate_nl_to_sql(user_query)
        chat_log = session.get('chat_log', [])
        chat_log.append({'user': user_query})

        if sql_query.strip():
            # Execute SQL and get results
            df, error = execute_sql_query(sql_query)
            if error:
                chat_log.append({'system': {'sql_query': sql_query, 'error': error}})
                follow_up = "It seems there was an issue with your query. Would you like to rephrase it or ask something else?"
            else:
                # Generate summary and results from the DataFrame using GPT
                summary = generate_summary(df, user_query)
                result_html = df.to_html() if not df.empty else "No results found."
                
                chat_log.append({
                    'system': {
                        'sql_query': sql_query,
                        'explanation': explanation,
                        'summary': summary,
                        'results': result_html     
                    }
                })
                follow_up = "Here are your results! Do you need more information on this or want to modify your query?"

        else:
            chat_log.append({'system': {'error': "Hmm, I couldn't find a valid SQL query. Can you try asking in a different way?"}})
            follow_up = "Let me know if you'd like help with rephrasing your question!"

        # Add the follow-up question to the chat log

        session['chat_log'] = chat_log

        # Log chat for debugging
        logger.debug(f"Chat log: {chat_log}")
        
        return jsonify({'chat_log': chat_log})

    return render_template('chat.html', chat_log=session.get('chat_log', []))

@app.route('/regenerate', methods=['POST'])
def regenerate():
    if 'username' not in session:
        return jsonify({'error': 'User not logged in'}), 401

    # Get the last user query from the chat log
    chat_log = session.get('chat_log', [])
    if not chat_log:
        return jsonify({'error': 'No previous queries found'}), 400

    last_query = next((entry['user'] for entry in reversed(chat_log) if 'user' in entry), None)
    if not last_query:
        return jsonify({'error': 'No valid user query found in the chat log'}), 400

    # Translate natural language to SQL
    sql_query, explanation = translate_nl_to_sql(last_query)

    if sql_query.strip():
        # Execute SQL and get results
        df, error = execute_sql_query(sql_query)
        if error:
            regenerated_response = {'sql_query': sql_query, 'error': error}
            follow_up = "It seems there was an issue with your query. Would you like to rephrase it or ask something else?"
        else:
            # Generate summary and results from the DataFrame using GPT
            summary = generate_summary(df, last_query)
            result_html = df.to_html() if not df.empty else "No results found."

            regenerated_response = {
                'sql_query': sql_query,
                'explanation': explanation,
                'summary': summary,
                'results': result_html
            }
            follow_up = "Here are your regenerated results! Do you need more information on this or want to modify your query?"

    else:
        regenerated_response = {'error': "Hmm, I couldn't find a valid SQL query. Can you try asking in a different way?"}
        follow_up = "Let me know if you'd like help with rephrasing your question!"

    # Update the chat log
    chat_log.append({'system': regenerated_response})
    session['chat_log'] = chat_log

    # Log chat for debugging
    logger.debug(f"Chat log after regeneration: {chat_log}")

    return jsonify({'chat_log': chat_log})

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

@app.route('/clear', methods=['POST'])
def clear_chat():
    session['chat_log'] = []  # Clear chat log
    session.modified = True
    return jsonify({'status': 'Chat cleared'})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5012, debug=True)
