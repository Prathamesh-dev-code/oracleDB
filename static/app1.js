$(document).ready(function() {
    let lastUserQuery = '';  // Store the last user query

    fetchAllowedTables();

    $('#chat-form').on('submit', function(event) {
        event.preventDefault();
        const userQuery = $('#user_query').val();

        // Ensure userQuery is not empty
        if (!userQuery.trim()) {
            console.error("Query is empty!");
            return;
        }

        lastUserQuery = userQuery; // Update lastUserQuery with current input

        // Show loader
        $('#chat-log').append('<div id="loader" class="loader" role="status"></div>');
        $('#user_query').prop('disabled', true); // Disable input while loading

        $.ajax({
            type: 'POST',
            url: '/chat',
            data: { user_query: userQuery },
            cache: false,
        })
        .done(function(response) {
            $('#chat-log').empty();  // Clear the chat log
            console.log('response : ' + response.chat_log);  // Log the response for debugging

            if (response && Array.isArray(response.chat_log)) {
                let chatLog = response.chat_log;
                chatLog.forEach(function(message, index) {
                    let userMessage = '';
                    let systemMessage = '';

                    if (message.user) {
                        userMessage = '<div class="user-message message-bubble">' + message.user + '</div>';
                    }
                    if (message.system) {
                        systemMessage += '<div class="system-message message-bubble">';

                        // Initialize count for the fields
                        let detailCount = 0;

                        // Check for summary and results to display
                        if (message.system.summary) {
                            systemMessage += '<div class="summary" style="color: black;">' + message.system.summary + '</div>';
                        }

                        if (message.system.results) {
                            systemMessage += '<div class="results" style="overflow-y:auto; color: black;">Results: ' + message.system.results + '</div>';
                        }

                        // Create detailed view section but don't add to DOM yet
                        const detailedViewContent = $('<div class="detailed-view-content" id="details-' + index + '" style="display:none; margin-top: 10px;"></div>');

                        // Include both SQL query and explanation inside the detailed view if both exist
                        if (message.system.sql_query) {
                            detailedViewContent.append('<div class="sql-query" style="color: blue;">' + message.system.sql_query + '</div>');
                            detailCount++;
                        }

                        if (message.system.explanation) {
                            detailedViewContent.append('<div class="explanation" style="color: black;">' + message.system.explanation + '</div>');
                            detailCount++;
                        }

                        // Show the buttons only if detailed information exists
                        if (detailCount > 0) {
                            systemMessage += `<button class="detailed-view-btn" data-index="${index}" style="color: blue; margin-top: 10px; margin-right: 5px;">Detailed View</button>`;
                            systemMessage += `<button class="regenerate-btn" style="color: blue; margin-top: 10px;">Regenerate</button>`; // Removed data-index
                        }

                        // Append the detailed view content to the systemMessage
                        systemMessage += detailedViewContent.prop('outerHTML');

                        // If only the SQL query is present, display it without hiding it behind the button
                        if (detailCount === 1 && message.system.sql_query) {
                            systemMessage += '<div class="sql-query" style="color: black;">' + message.system.sql_query + '</div>';
                        }

                        systemMessage += '</div>'; // Close system-message
                    }

                    $('#chat-log').append('<div class="message">' + userMessage + systemMessage + '</div>');
                });

                $('#user_query').val('');
                $('#chat-log').scrollTop($('#chat-log')[0].scrollHeight);  // Scroll to bottom

                // Show the regenerate button after a new response is added
                $('#regenerate-btn').show();

                // Add event listener for "Detailed View" buttons
                $('.detailed-view-btn').on('click', function() {
                    const index = $(this).data('index');
                    $(`#details-${index}`).toggle();  // Toggle visibility of detailed content
                });

                // Add event listener for "Regenerate" buttons
                $('.regenerate-btn').off('click').on('click', function() {
                    regenerateResponse(lastUserQuery); // Pass the last user query for regeneration
                });
            } else {
                console.error('Chat log is undefined or not an array:', response);
                $('#chat-log').append('<div class="message system-message message-bubble">Error: Invalid chat log format. Response: ' + JSON.stringify(response) + '</div>');
            }
        })
        .fail(function(xhr, status, error) {
            // Handle failure
            console.error('Error occurred:', error);
            $('#chat-log').append('<div class="message system-message message-bubble">Error: Failed to fetch chat log. Status: ' + status + ', Error: ' + error + '</div>');
        })
        .always(function() {
            // Hide loader and enable input
            $('#loader').remove();
            $('#user_query').prop('disabled', false); // Re-enable input after loading
        });
    });

    $('#clear-chat').click(function () {
        $.ajax({
            type: 'POST',
            url: '/clear',
            success: function () {
                $('#chat-log').empty();  // Clear the chat log on the frontend
                lastUserQuery = ''; // Clear lastUserQuery on chat clear
            }
        });
    });

    function regenerateResponse(query) {
        $('#regenerate-btn').prop('disabled', true); // Disable button while loading

        // Show loader
        $('#chat-log').append('<div id="loader" class="loader" role="status"></div>');

        $.ajax({
            type: 'POST',
            url: '/regenerate',
            data: { user_query: query }, // Send lastUserQuery
            cache: false,
        })
        .done(function(response) {
            $('#chat-log').empty();  // Clear the chat log
            console.log('response : ' + response.chat_log);  // Log the response for debugging

            if (response && Array.isArray(response.chat_log)) {
                let chatLog = response.chat_log;
                chatLog.forEach(function(message, index) {
                    let userMessage = '';
                    let systemMessage = '';

                    if (message.user) {
                        userMessage = '<div class="user-message message-bubble">' + message.user + '</div>';
                    }
                    if (message.system) {
                        systemMessage += '<div class="system-message message-bubble">';

                        // Initialize count for the fields
                        let detailCount = 0;

                        // Check for summary and results to display
                        if (message.system.summary) {
                            systemMessage += '<div class="summary" style="color: black;">' + message.system.summary + '</div>';
                        }

                        if (message.system.results) {
                            systemMessage += '<div class="results" style="overflow-y:auto; color: black;">Results: ' + message.system.results + '</div>';
                        }

                        // Create detailed view section but don't add to DOM yet
                        const detailedViewContent = $('<div class="detailed-view-content" id="details-' + index + '" style="display:none; margin-top: 10px;"></div>');

                        // Include both SQL query and explanation inside the detailed view if both exist
                        if (message.system.sql_query) {
                            detailedViewContent.append('<div class="sql-query" style="color: blue;">' + message.system.sql_query + '</div>');
                            detailCount++;
                        }

                        if (message.system.explanation) {
                            detailedViewContent.append('<div class="explanation" style="color: black;">' + message.system.explanation + '</div>');
                            detailCount++;
                        }

                        // Show the buttons only if detailed information exists
                        if (detailCount > 0) {
                            systemMessage += `<button class="detailed-view-btn" data-index="${index}" style="color: blue; margin-top: 10px; margin-right: 5px;">Detailed View</button>`;
                            systemMessage += `<button class="regenerate-btn" style="color: blue; margin-top: 10px;">Regenerate</button>`; // Removed data-index
                        }

                        // Append the detailed view content to the systemMessage
                        systemMessage += detailedViewContent.prop('outerHTML');

                        // If only the SQL query is present, display it without hiding it behind the button
                        if (detailCount === 1 && message.system.sql_query) {
                            systemMessage += '<div class="sql-query" style="color: black;">' + message.system.sql_query + '</div>';
                        }

                        systemMessage += '</div>'; // Close system-message
                    }

                    $('#chat-log').append('<div class="message">' + userMessage + systemMessage + '</div>');
                });

                $('#chat-log').scrollTop($('#chat-log')[0].scrollHeight);  // Scroll to bottom

                // Show the regenerate button after a new response is added
                $('#regenerate-btn').show();

                // Add event listener for "Detailed View" buttons
                $('.detailed-view-btn').on('click', function() {
                    const index = $(this).data('index');
                    $(`#details-${index}`).toggle();  // Toggle visibility of detailed content
                });

                // Add event listener for "Regenerate" buttons
                $('.regenerate-btn').off('click').on('click', function() {
                    regenerateResponse(lastUserQuery); // Pass the last user query for regeneration
                });
            } else {
                console.error('Chat log is undefined or not an array:', response);
                $('#chat-log').append('<div class="message system-message message-bubble">Error: Invalid chat log format. Response: ' + JSON.stringify(response) + '</div>');
            }
        })
        .fail(function(xhr, status, error) {
            // Handle failure
            console.error('Error occurred:', error);
            $('#chat-log').append('<div class="message system-message message-bubble">Error: Failed to fetch chat log. Status: ' + status + ', Error: ' + error + '</div>');
        })
        .always(function() {
            // Hide loader and enable input
            $('#loader').remove();
            $('#regenerate-btn').prop('disabled', false); // Re-enable button after loading
        });
    }

    function fetchAllowedTables() {
        $.ajax({
            type: 'GET',
            url: '/get_allowed_tables', // Update this endpoint to match your Flask route
            success: function(tables) {
                const sidebar = $('.sidebar');
                sidebar.append('<h4 class="mt-4" style="">Allowed Tables</h4><ul class="list-group" id="allowed-table-list"></ul>');

                tables.forEach(function(table) {
                    $('#allowed-table-list').append('<li class="list-group-item">' + table + '</li>');
                });
            },
            error: function(xhr, status, error) {
                console.error('Error fetching allowed tables:', error);
            }
        });
    }

    // RELOADING FEATURE
    if (sessionStorage.getItem('reloaded') === 'true') {
        sessionStorage.removeItem('reloaded');  // Clear the session flag after detecting the reload
        window.location.href = "/";  // Redirect to the login page only once after reload
    }

    // Detect if the user is trying to reload the page by checking 'beforeunload' event
    $(window).on('beforeunload', function () {
        // Set a flag in sessionStorage when the page is being unloaded (reloaded)
        sessionStorage.setItem('reloaded', 'true');
    });

    // If the user logs in successfully, clear the reloaded flag so it doesn't cause a redirect after login
    function clearReloadFlagOnLogin() {
        sessionStorage.removeItem('reloaded');  // Clear the reloaded flag on successful login
    }

    // Simulate the login process for demo purposes; in practice, this would be replaced with actual login code
    $('#login-form').on('submit', function (event) {
        event.preventDefault();
        
        // Handle the login via AJAX or another method
        
        // On successful login, clear the reload flag and redirect to the main page
        clearReloadFlagOnLogin();
        
        // Redirect to the main page after login 
        window.location.href = "/chat";  
    });
});

function appendMessages(chatLog) {
    chatLog.forEach(function(message) {
        let userMessage = message.user ? '<div class="user-message message-bubble">' + message.user + '</div>' : '';
        let systemMessage = '';

        if (message.system) {
            systemMessage += '<div class="system-message message-bubble">';

            // Check for summary and results to display
            if (message.system.summary) {
                systemMessage += '<div class="summary" style="color: black;">' + message.system.summary + '</div>';
            }

            if (message.system.results) {
                systemMessage += '<div class="results" style="overflow-y:auto; color: black;">Results: ' + message.system.results + '</div>';
            }

            // Create detailed view section
            const detailedViewContent = $('<div class="detailed-view-content" style="display:none; margin-top: 10px;"></div>');

            if (message.system.sql_query) {
                detailedViewContent.append('<div class="sql-query" style="color: blue;">' + message.system.sql_query + '</div>');
            }

            if (message.system.explanation) {
                detailedViewContent.append('<div class="explanation" style="color: black;">' + message.system.explanation + '</div>');
            }

            if (detailedViewContent.children().length > 0) {
                systemMessage += `<button class="detailed-view-btn" style="color: blue; margin-top: 10px; margin-right: 5px;">Detailed View</button>`;
                systemMessage += `<button class="regenerate-btn" style="color: blue; margin-top: 10px;">Regenerate</button>`;
            }

            systemMessage += detailedViewContent.prop('outerHTML');
            systemMessage += '</div>'; // Close system-message
        }

        $('#chat-log').append('<div class="message">' + userMessage + systemMessage + '</div>');
    });
}
function regenerateResponse() {
    $('#regenerate-btn').prop('disabled', true); // Disable button while loading

    // Show loader
    $('#chat-log').append('<div id="loader" class="loader" role="status"></div>');

    $.ajax({
        type: 'POST',
        url: '/regenerate',
        data: { user_query: lastUserQuery }, // Send lastUserQuery
        cache: false,
    })
    .done(function(response) {
        if (response && Array.isArray(response.chat_log)) {
            appendMessages(response.chat_log);
            $('#chat-log').scrollTop($('#chat-log')[0].scrollHeight);  // Scroll to bottom
        } else {
            console.error('Chat log is undefined or not an array:', response);
            $('#chat-log').append('<div class="message system-message message-bubble">Error: Invalid chat log format. Response: ' + JSON.stringify(response) + '</div>');
        }
    })
    $(document).on('click', '.detailed-view-btn', function() {
        $(this).next('.detailed-view-content').toggle();  // Toggle visibility of detailed content
    });
    
    $(document).on('click', '.regenerate-btn', function() {
        regenerateResponse();
    })
    
    .fail(function(xhr, status, error) {
        console.error('Error occurred:', error);
        $('#chat-log').append('<div class="message system-message message-bubble">Error: Failed to fetch chat log. Status: ' + status + ', Error: ' + error + '</div>');
    })
    .always(function() {
        $('#loader').remove();
        $('#regenerate-btn').prop('disabled', false); // Re-enable button after loading
    });
}
    
$(document).on('click', '.detailed-view-btn', function() {
    $(this).next('.detailed-view-content').toggle();  // Toggle visibility of detailed content
});

$(document).on('click', '.regenerate-btn', function() {
    regenerateResponse();
});
