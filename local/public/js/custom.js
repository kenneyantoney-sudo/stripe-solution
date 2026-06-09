// Clientside helper: convert every element with class "amount" from cents
// (data-amount) to a dollars-and-cents string. Keeps display formatting in
// one place; the actual charge amount always comes from the server.
$(document).ready(function () {
  var amounts = document.getElementsByClassName("amount");
  for (var i = 0; i < amounts.length; i++) {
    var cents = amounts[i].getAttribute("data-amount") / 100;
    amounts[i].innerHTML = cents.toFixed(2);
  }
});
