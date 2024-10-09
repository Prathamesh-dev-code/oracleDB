$(document).ready(function() {
    // Fetch allowed tables when the page loads
    fetchAllowedTables();

    $('#chat-form').on('submit', function(event) {
        event.preventDefault();
        const userQuery = $('#user_query').val();

        // Ensure userQuery is not empty
        if (!userQuery.trim()) {
            console.error("Query is empty!");
            return;
        }

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
            console.log('response : '+response.chat_log);  // Log the response for debugging
    
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
                            systemMessage += '<div class="summary" style="color: green;">' + message.system.summary + '</div>';
                            detailCount++;
                        }
    
                        if (message.system.results) {
                            systemMessage += '<div class="results" style="overflow-y:auto; color: purple;">Results: ' + message.system.results + '</div>';
                            detailCount++;
                        }

                        // Determine if to show the "Detailed View" button
                        if (message.system.sql_query || message.system.explanation) {
                            if (detailCount > 0) {
                                systemMessage += `<button class="detailed-view-btn" data-index="${index}" style="color: blue; margin-top: 10px;">Detailed View</button>`;
                            }
                        }

                        // Create detailed view section but don't add to DOM yet
                        const detailedViewContent = $('<div class="detailed-view-content" id="details-' + index + '" style="margin-top: 10px; "></div>');
    
                        // Display SQL query if available
                        if (message.system.sql_query) {
                            detailedViewContent.append('<div class="sql-query" style="color: blue;">' + message.system.sql_query + '</div>');
                            detailCount++;
                        }

                        // Display explanation if available
                        if (message.system.explanation) {
                            detailedViewContent.append('<div class="explanation" style="color: purple;">' + message.system.explanation + '</div>');
                            detailCount++;
                        }

                        // Append the detailed view content if there is any detail
                        if (detailCount > 0) {
                            systemMessage += detailedViewContent.prop('outerHTML'); // Add the hidden content to systemMessage
                        }

                        systemMessage += '</div>'; // Close system-message
                    }
    
                    $('#chat-log').append('<div class="message">' + userMessage + systemMessage + '</div>');
                });

                $('#user_query').val('');
                $('#chat-log').scrollTop($('#chat-log')[0].scrollHeight);  // Scroll to bottom

                // Add event listener for "Detailed View" buttons
                $('.detailed-view-btn').on('click', function() {
                    const index = $(this).data('index');
                    $(`#details-${index}`).toggle();  // Toggle visibility of detailed content
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
            }
        });
    });

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
});
